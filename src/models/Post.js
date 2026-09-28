const mongoose = require('mongoose');
const { UNIVERSITY_OPTIONS } = require('../constants/universities');

const reactionRecordSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  reactionType: { type: String, required: true, enum: ['Relatable', 'Helpful', 'Support', 'Vibe'] }
}, { _id: false });

const replySchema = new mongoose.Schema({
  text: {
    type: String,
    required: [true, 'Reply text is required'],
    trim: true,
    minlength: [1, 'Reply cannot be empty'],
    maxlength: [1000, 'Reply cannot exceed 1000 characters']
  },
  authorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Reply author is required']
  }
}, { timestamps: true, versionKey: false });

const commentSchema = new mongoose.Schema({
  text: {
    type: String,
    required: [true, 'Comment text is required'],
    trim: true,
    minlength: [1, 'Comment cannot be empty'],
    maxlength: [1000, 'Comment cannot exceed 1000 characters']
  },
  authorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Comment author is required'],
    index: true
  },
  reactions: {
    Relatable: { type: Number, default: 0, min: 0 },
    Helpful: { type: Number, default: 0, min: 0 },
    Support: { type: Number, default: 0, min: 0 },
    Vibe: { type: Number, default: 0, min: 0 },
  },
  userReactions: [reactionRecordSchema],
  replies: {
    type: [replySchema],
    validate: {
      validator: (value) => value.length <= 50,
      message: 'A comment cannot have more than 50 replies'
    }
  }
}, { timestamps: true, versionKey: false });

const postSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Post title is required'],
    trim: true,
    minlength: [3, 'Post title must be at least 3 characters'],
    maxlength: [140, 'Post title cannot exceed 140 characters']
  },
  content: {
    type: String,
    required: [true, 'Post content is required'],
    trim: true,
    minlength: [1, 'Post content cannot be empty'],
    maxlength: [5000, 'Post content cannot exceed 5000 characters']
  },
  authorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Post author is required'],
    index: true
  },
  universityTag: {
    type: String,
    required: [true, 'University tag is required'],
    enum: {
      values: UNIVERSITY_OPTIONS,
      message: 'University tag must be one of: UOG, ILM, Superior, UOC, Swedish, UOP, or Other'
    },
    index: true
  },
  category: {
    type: String,
    enum: {
      values: ['Admissions', 'Course Review', 'General'],
      message: 'Category must be Admissions, Course Review, or General'
    },
    default: 'General',
    index: true
  },
  mediaUrl: {
    type: String,
    default: '',
    maxlength: [2000, 'Media URL cannot exceed 2000 characters']
  },
  reactions: {
    Relatable: { type: Number, default: 0, min: 0 },
    Helpful: { type: Number, default: 0, min: 0 },
    Support: { type: Number, default: 0, min: 0 },
    Vibe: { type: Number, default: 0, min: 0 },
  },
  userReactions: [reactionRecordSchema],
  comments: {
    type: [commentSchema],
    validate: {
      validator: (value) => value.length <= 500,
      message: 'A post cannot have more than 500 comments'
    }
  }
}, { timestamps: true, versionKey: false });

postSchema.set('toJSON', { transform: (_document, returnedObject) => { delete returnedObject.upvotedBy; return returnedObject; } });
module.exports = mongoose.model('Post', postSchema);