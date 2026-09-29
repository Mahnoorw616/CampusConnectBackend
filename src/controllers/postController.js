const mongoose = require('mongoose');
const Notification = require('../models/Notifications');
const Post = require('../models/Post');
const PostReaction = require('../models/PostReaction');
const CommentReaction = require('../models/CommentReaction');
const SavedPost = require('../models/SavedPost');
const { normalizeMediaValue, deleteMediaById } = require('../config/mediaStore');
const { UNIVERSITY_OPTIONS } = require('../constants/universities');

const REACTION_TYPES = ['Relatable', 'Helpful', 'Support', 'Vibe'];
const CATEGORIES = ['Admissions', 'Course Review', 'General'];
const EMPTY_REACTIONS = { Relatable: 0, Helpful: 0, Support: 0, Vibe: 0 };

const httpError = (statusCode, message) => Object.assign(new Error(message), { statusCode });
const getOrigin = (req) => (process.env.PUBLIC_API_ORIGIN || `${req.protocol}://${req.get('host')}`).replace(/\/+$/, '');
const mediaIdFromUrl = (url) => String(url || '').match(/\/api\/media\/([a-f0-9]{24})$/i)?.[1] || '';
const mediaTypeFromValue = (value) => {
  const normalized = String(value || '').toLowerCase();
  if (normalized.startsWith('data:video/')) return 'video';
  if (normalized.startsWith('data:image/')) return 'image';
  if (/\.(mp4|webm|mov|m4v|ogg)(?:[?#].*)?$/i.test(normalized)) return 'video';
  if (/\.(png|jpe?g|gif|webp|bmp|avif)(?:[?#].*)?$/i.test(normalized)) return 'image';
  return '';
};

const pagination = (query) => {
  const pageValue = Number.parseInt(query.page, 10);
  const limitValue = Number.parseInt(query.limit, 10);
  const page = Number.isInteger(pageValue) && pageValue > 0 ? pageValue : 1;
  const limit = Number.isInteger(limitValue) && limitValue > 0 ? Math.min(limitValue, 100) : 20;
  return { page, limit, skip: (page - 1) * limit };
};

const populatePost = (query) => query
  .populate('authorId', 'name university batchYear bio avatar')
  .populate('comments.authorId', 'name university batchYear bio avatar')
  .populate('comments.replies.authorId', 'name university batchYear bio avatar');

const reactionMaps = async (posts, userId) => {
  const ids = posts.map((post) => post._id);
  if (!ids.length) return { posts: new Map(), comments: new Map(), saved: new Set() };
  const [postReactions, commentReactions, savedPosts] = await Promise.all([
    PostReaction.find({ postId: { $in: ids }, userId }).lean(),
    CommentReaction.find({ postId: { $in: ids }, userId }).lean(),
    SavedPost.find({ postId: { $in: ids }, userId }).select('postId').lean()
  ]);
  return {
    posts: new Map(postReactions.map((r) => [r.postId.toString(), r.reactionType])),
    comments: new Map(commentReactions.map((r) => [`${r.postId}:${r.commentId}`, r.reactionType])),
    saved: new Set(savedPosts.map((savedPost) => savedPost.postId.toString()))
  };
};

const serializePost = (post, maps) => {
  const value = post.toObject();
  const postId = post._id.toString();
  value.reactions = { ...EMPTY_REACTIONS, ...(value.reactions || {}) };
  value.userReaction = maps.posts.get(postId);
  value.isSaved = maps.saved.has(postId);
  value.comments = (value.comments || []).map((comment) => {
    const commentId = comment._id.toString();
    comment.reactions = { ...EMPTY_REACTIONS, ...(comment.reactions || {}) };
    comment.userReaction = maps.comments.get(`${postId}:${commentId}`);
    delete comment.userReactions;
    return comment;
  });
  delete value.userReactions;
  delete value.upvotedBy;
  delete value.upvotesCount;
  return value;
};

const serializeOne = async (post, userId) => serializePost(post, await reactionMaps([post], userId));

const validatePostFields = ({ title, content, category, universityTag }) => {
  const normalizedTitle = title === undefined ? undefined : String(title).trim();
  const normalizedContent = content === undefined ? undefined : String(content).trim();
  const normalizedCategory = category === undefined ? undefined : String(category).trim();
  const normalizedUniversity = universityTag === undefined ? undefined : String(universityTag).trim();
  if (normalizedTitle !== undefined && (normalizedTitle.length < 3 || normalizedTitle.length > 140)) return { error: 'Post title must be between 3 and 140 characters' };
  if (normalizedContent !== undefined && (normalizedContent.length < 1 || normalizedContent.length > 5000)) return { error: 'Post content must be between 1 and 5000 characters' };
  if (normalizedCategory !== undefined && !CATEGORIES.includes(normalizedCategory)) return { error: `category must be one of: ${CATEGORIES.join(', ')}` };
  if (normalizedUniversity !== undefined && !UNIVERSITY_OPTIONS.includes(normalizedUniversity)) return { error: `universityTag must be one of: ${UNIVERSITY_OPTIONS.join(', ')}` };
  return { normalizedTitle, normalizedContent, normalizedCategory, normalizedUniversity };
};

// Notifications should never turn a successfully saved interaction into an error.
const notify = async (recipient, sender, type, message, post) => {
  if (!recipient || recipient.toString() === sender.toString()) return;
  try {
    await Notification.create({ recipient, sender, type, message, post });
  } catch (error) {
    console.error('Could not create notification:', error);
  }
};

const getPosts = async (req, res, next) => {
  try {
    const filter = {};
    const university = req.query.uni ? String(req.query.uni).trim() : '';
    const category = req.query.category ? String(req.query.category).trim() : '';
    if (university) {
      if (!UNIVERSITY_OPTIONS.includes(university)) return res.status(400).json({ success: false, message: `uni must be one of: ${UNIVERSITY_OPTIONS.join(', ')}` });
      filter.universityTag = university;
    }
    if (category) {
      if (!CATEGORIES.includes(category)) return res.status(400).json({ success: false, message: `category must be one of: ${CATEGORIES.join(', ')}` });
      filter.category = category;
    }
    if (String(req.query.mine).toLowerCase() === 'true') {
      filter.authorId = req.user._id;
    }
    const { page, limit, skip } = pagination(req.query);
    const [posts, total] = await Promise.all([
      populatePost(Post.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit)),
      Post.countDocuments(filter)
    ]);
    const maps = await reactionMaps(posts, req.user._id);
    return res.json({ success: true, count: posts.length, total, page, limit, pages: Math.ceil(total / limit), posts: posts.map((post) => serializePost(post, maps)) });
  } catch (error) { return next(error); }
};

const createPost = async (req, res, next) => {
  try {
    const { title, content, universityTag, category, mediaUrl, mediaType } = req.body;
    if (!title || !content || !universityTag) return res.status(400).json({ success: false, message: 'title, content, and universityTag are required' });
    if (mediaType !== undefined && mediaType !== '' && !['image', 'video'].includes(mediaType)) {
      return res.status(400).json({ success: false, message: 'mediaType must be image or video' });
    }
    const fields = validatePostFields({ title, content, category, universityTag });
    if (fields.error) return res.status(400).json({ success: false, message: fields.error });
    let storedMediaUrl = '';
    try {
      storedMediaUrl = await normalizeMediaValue({
        value: mediaUrl,
        kind: 'post',
        requestOrigin: getOrigin(req)
      });
      const post = await Post.create({
        title: fields.normalizedTitle,
        content: fields.normalizedContent,
        universityTag: fields.normalizedUniversity,
        category: fields.normalizedCategory || 'General',
        mediaUrl: storedMediaUrl,
        mediaType: mediaType || mediaTypeFromValue(mediaUrl) || mediaTypeFromValue(storedMediaUrl),
        reactions: { ...EMPTY_REACTIONS },
        authorId: req.user._id
      });
      return res.status(201).json({
        success: true,
        message: 'Post created successfully',
        post: await serializeOne(
          await populatePost(Post.findById(post._id)),
          req.user._id
        )
      });
    } catch (error) {
      const uploadedMediaId = mediaIdFromUrl(storedMediaUrl);
      if (uploadedMediaId) {
        await deleteMediaById(uploadedMediaId).catch((cleanupError) => {
          console.error('Could not clean up failed post media upload:', cleanupError);
        });
      }
      throw error;
    }
  } catch (error) { return next(error); }
};

const updatePost = async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ success: false, message: 'Invalid post ID' });
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ success: false, message: 'Post not found' });
    if (post.authorId.toString() !== req.user._id.toString()) return res.status(403).json({ success: false, message: 'Not authorized to edit this post' });
    const fields = validatePostFields(req.body);
    if (fields.error) return res.status(400).json({ success: false, message: fields.error });
    const oldMediaId = mediaIdFromUrl(post.mediaUrl);
    if (fields.normalizedTitle !== undefined) post.title = fields.normalizedTitle;
    if (fields.normalizedContent !== undefined) post.content = fields.normalizedContent;
    if (fields.normalizedCategory !== undefined) post.category = fields.normalizedCategory;
    if (fields.normalizedUniversity !== undefined) post.universityTag = fields.normalizedUniversity;
    if (Object.prototype.hasOwnProperty.call(req.body, 'mediaUrl')) {
      post.mediaUrl = await normalizeMediaValue({ value: req.body.mediaUrl, kind: 'post', requestOrigin: getOrigin(req) });
      post.mediaType = mediaTypeFromValue(req.body.mediaUrl);
    }
    await post.save();
    const newMediaId = mediaIdFromUrl(post.mediaUrl);
    if (oldMediaId && oldMediaId !== newMediaId) await deleteMediaById(oldMediaId);
    return res.json({ success: true, message: 'Post updated successfully', post: await serializeOne(await populatePost(Post.findById(post._id)), req.user._id) });
  } catch (error) { return next(error); }
};

const deletePost = async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ success: false, message: 'Invalid post ID' });
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ success: false, message: 'Post not found' });
    if (post.authorId.toString() !== req.user._id.toString()) return res.status(403).json({ success: false, message: 'Not authorized to delete this post' });
    await Promise.all([
      PostReaction.deleteMany({ postId: post._id }),
      CommentReaction.deleteMany({ postId: post._id }),
      SavedPost.deleteMany({ postId: post._id }),
      Post.findByIdAndDelete(post._id)
    ]);
    const mediaId = mediaIdFromUrl(post.mediaUrl);
    if (mediaId) await deleteMediaById(mediaId);
    return res.json({ success: true, message: 'Post deleted successfully', postId: req.params.id });
  } catch (error) { return next(error); }
};

const addComment = async (req, res, next) => {
  try {
    const text = typeof req.body.text === 'string' ? req.body.text.trim() : '';
    if (!text) return res.status(400).json({ success: false, message: 'Comment text is required' });
    if (text.length > 1000) return res.status(400).json({ success: false, message: 'Comment cannot exceed 1000 characters' });
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ success: false, message: 'Invalid post ID' });
    const now = new Date();
    const post = await Post.findByIdAndUpdate(req.params.id, { $push: { comments: { text, authorId: req.user._id, reactions: { ...EMPTY_REACTIONS }, replies: [], createdAt: now, updatedAt: now } } }, { new: true, runValidators: true });
    if (!post) return res.status(404).json({ success: false, message: 'Post not found' });
    await notify(post.authorId, req.user._id, 'COMMENT', `${req.user.name} commented on your discussion: ${post.title}`, post._id);
    return res.status(201).json({ success: true, message: 'Comment added successfully', post: await serializeOne(await populatePost(Post.findById(post._id)), req.user._id) });
  } catch (error) { return next(error); }
};

const getPostComment = async (postId, commentId) => {
  if (!mongoose.isValidObjectId(postId) || !mongoose.isValidObjectId(commentId)) throw httpError(400, 'Invalid ID parameters');
  const post = await Post.findById(postId);
  if (!post) throw httpError(404, 'Post not found');
  const comment = post.comments.id(commentId);
  if (!comment) throw httpError(404, 'Comment not found');
  return { post, comment };
};

const updateComment = async (req, res, next) => {
  try {
    const text = typeof req.body.text === 'string' ? req.body.text.trim() : '';
    if (!text) return res.status(400).json({ success: false, message: 'Comment text is required' });
    if (text.length > 1000) return res.status(400).json({ success: false, message: 'Comment cannot exceed 1000 characters' });
    const { post, comment } = await getPostComment(req.params.id, req.params.commentId);
    if (comment.authorId.toString() !== req.user._id.toString()) return res.status(403).json({ success: false, message: 'Not authorized to edit this comment' });
    comment.text = text;
    await post.save();
    return res.json({ success: true, message: 'Comment updated successfully', post: await serializeOne(await populatePost(Post.findById(post._id)), req.user._id) });
  } catch (error) { return next(error); }
};

const deleteComment = async (req, res, next) => {
  try {
    const { post, comment } = await getPostComment(req.params.id, req.params.commentId);
    if (comment.authorId.toString() !== req.user._id.toString()) return res.status(403).json({ success: false, message: 'Not authorized to delete this comment' });
    await CommentReaction.deleteMany({ postId: post._id, commentId: comment._id });
    post.comments.pull(comment._id);
    await post.save();
    return res.json({ success: true, message: 'Comment deleted successfully', post: await serializeOne(await populatePost(Post.findById(post._id)), req.user._id) });
  } catch (error) { return next(error); }
};

const toggleCommentReaction = async (req, res, next) => {
  if (!REACTION_TYPES.includes(req.body.reactionType)) return res.status(400).json({ success: false, message: 'Invalid reaction type' });
  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      const { post, comment } = await getPostComment(req.params.id, req.params.commentId);
      const sessionPost = await Post.findById(post._id).session(session);
      const sessionComment = sessionPost.comments.id(comment._id);
      const existing = await CommentReaction.findOne({ postId: sessionPost._id, commentId: sessionComment._id, userId: req.user._id }).session(session);
      sessionComment.reactions = { ...EMPTY_REACTIONS, ...(sessionComment.reactions || {}) };
      let userReaction;
      if (!existing) {
        sessionComment.reactions[req.body.reactionType] += 1;
        await CommentReaction.create([{ postId: sessionPost._id, commentId: sessionComment._id, userId: req.user._id, reactionType: req.body.reactionType }], { session });
        userReaction = req.body.reactionType;
      } else if (existing.reactionType === req.body.reactionType) {
        sessionComment.reactions[existing.reactionType] = Math.max(0, sessionComment.reactions[existing.reactionType] - 1);
        await CommentReaction.deleteOne({ _id: existing._id }).session(session);
      } else {
        sessionComment.reactions[existing.reactionType] = Math.max(0, sessionComment.reactions[existing.reactionType] - 1);
        sessionComment.reactions[req.body.reactionType] += 1;
        existing.reactionType = req.body.reactionType;
        await existing.save({ session });
        userReaction = req.body.reactionType;
      }
      sessionPost.markModified('comments');
      await sessionPost.save({ session });
      result = { reactions: sessionComment.reactions.toObject ? sessionComment.reactions.toObject() : sessionComment.reactions, userReaction };
    });
    return res.json({ success: true, ...result });
  } catch (error) { return next(error); } finally { await session.endSession(); }
};

const addCommentReply = async (req, res, next) => {
  try {
    const text = typeof req.body.text === 'string' ? req.body.text.trim() : '';
    if (!text) return res.status(400).json({ success: false, message: 'Reply text is required' });
    if (text.length > 1000) return res.status(400).json({ success: false, message: 'Reply cannot exceed 1000 characters' });
    const { post, comment } = await getPostComment(req.params.id, req.params.commentId);
    if (!Array.isArray(comment.replies)) comment.replies = [];
    comment.replies.push({ text, authorId: req.user._id, createdAt: new Date() });
    await post.save();
    await notify(comment.authorId, req.user._id, 'COMMENT', `${req.user.name} replied to your comment on: ${post.title}`, post._id);
    return res.status(201).json({ success: true, message: 'Reply added successfully', post: await serializeOne(await populatePost(Post.findById(post._id)), req.user._id) });
  } catch (error) { return next(error); }
};

const toggleReaction = async (req, res, next) => {
  if (!REACTION_TYPES.includes(req.body.reactionType)) return res.status(400).json({ success: false, message: 'Invalid reaction type' });
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ success: false, message: 'Invalid post ID' });
  const session = await mongoose.startSession();
  try {
    let result;
    let notification;
    await session.withTransaction(async () => {
      const post = await Post.findById(req.params.id).session(session);
      if (!post) throw httpError(404, 'Post not found');
      const existing = await PostReaction.findOne({ postId: post._id, userId: req.user._id }).session(session);
      post.reactions = { ...EMPTY_REACTIONS, ...(post.reactions || {}) };
      let userReaction;
      if (!existing) {
        post.reactions[req.body.reactionType] += 1;
        await PostReaction.create([{ postId: post._id, userId: req.user._id, reactionType: req.body.reactionType }], { session });
        userReaction = req.body.reactionType;
      } else if (existing.reactionType === req.body.reactionType) {
        post.reactions[existing.reactionType] = Math.max(0, post.reactions[existing.reactionType] - 1);
        await PostReaction.deleteOne({ _id: existing._id }).session(session);
      } else {
        post.reactions[existing.reactionType] = Math.max(0, post.reactions[existing.reactionType] - 1);
        post.reactions[req.body.reactionType] += 1;
        existing.reactionType = req.body.reactionType;
        await existing.save({ session });
        userReaction = req.body.reactionType;
      }
      post.markModified('reactions');
      await post.save({ session });
      if (
        userReaction &&
        !existing &&
        post.authorId.toString() !== req.user._id.toString()
      ) {
        notification = {
          recipient: post.authorId,
          sender: req.user._id,
          type: 'LIKE',
          message: `${req.user.name || 'Someone'} reacted to your discussion: ${post.title}`,
          post: post._id
        };
      }
      result = { reactions: post.reactions.toObject ? post.reactions.toObject() : post.reactions, userReaction };
    });
    if (notification) {
      await notify(
        notification.recipient,
        notification.sender,
        notification.type,
        notification.message,
        notification.post
      );
    }
    return res.json({ success: true, ...result });
  } catch (error) { return next(error); } finally { await session.endSession(); }
};

const getSavedPosts = async (req, res, next) => {
  try {
    const savedRecords = await SavedPost.find({ userId: req.user._id })
      .sort({ createdAt: -1 })
      .select('postId');

    const postIds = savedRecords.map((record) => record.postId);
    if (!postIds.length) {
      return res.json({
        success: true,
        count: 0,
        total: 0,
        page: 1,
        limit: 0,
        pages: 0,
        posts: []
      });
    }

    const posts = await populatePost(Post.find({ _id: { $in: postIds } }));
    const postsById = new Map(posts.map((post) => [post._id.toString(), post]));
    const orderedPosts = postIds
      .map((postId) => postsById.get(postId.toString()))
      .filter(Boolean);
    const maps = await reactionMaps(orderedPosts, req.user._id);

    return res.json({
      success: true,
      count: orderedPosts.length,
      total: orderedPosts.length,
      page: 1,
      limit: orderedPosts.length,
      pages: orderedPosts.length ? 1 : 0,
      posts: orderedPosts.map((post) => serializePost(post, maps))
    });
  } catch (error) {
    return next(error);
  }
};

const toggleSavedPost = async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: 'Invalid post ID' });
    }

    const post = await Post.findById(req.params.id).select('_id');
    if (!post) {
      return res.status(404).json({ success: false, message: 'Post not found' });
    }

    const existing = await SavedPost.findOne({
      userId: req.user._id,
      postId: post._id
    });

    if (existing) {
      await SavedPost.deleteOne({ _id: existing._id });
      return res.json({
        success: true,
        isSaved: false,
        message: 'Post removed from saved discussions'
      });
    }

    await SavedPost.create({
      userId: req.user._id,
      postId: post._id
    });

    return res.json({
      success: true,
      isSaved: true,
      message: 'Post saved successfully'
    });
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  getPosts,
  getSavedPosts,
  toggleSavedPost,
  createPost,
  updatePost,
  deletePost,
  addComment,
  updateComment,
  deleteComment,
  toggleCommentReaction,
  addCommentReply,
  toggleReaction
};