const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const request = require('supertest');

require('dotenv').config();

const app = require('../src/app');
const User = require('../src/models/User');
const Post = require('../src/models/Post');
const Marketplace = require('../src/models/Marketplace');
const PostReaction = require('../src/models/PostReaction');
const CommentReaction = require('../src/models/CommentReaction');

const testEmail = `qa-${Date.now()}@example.com`;
let token;
let userId;
let postId;
let commentId;

test.before(async () => {
    const mongoUri = process.env.TEST_MONGO_URI;
    if (!mongoUri) {
        throw new Error(
            'TEST_MONGO_URI is required. Use a dedicated MongoDB test database.'
        );
    }

    await mongoose.connect(mongoUri);
});

test.after(async () => {
    if (mongoose.connection.readyState === 1) {
        if (postId) {
            await Promise.all([
                PostReaction.deleteMany({ postId }),
                CommentReaction.deleteMany({ postId }),
                Post.deleteOne({ _id: postId })
            ]);
        }
        await Marketplace.deleteMany({ sellerId: userId });
        await User.deleteMany({ email: testEmail });
        await mongoose.disconnect();
    }
});

test('health endpoint is available', async () => {
    const response = await request(app).get('/api/health');
    assert.equal(response.status, 200);
    assert.equal(response.body.success, true);
});

test('registers a user without returning the password', async () => {
    const response = await request(app)
        .post('/api/auth/register')
        .send({
            name: 'Backend QA User',
            email: testEmail,
            password: 'QaPassword123!',
            university: 'UOG',
            batchYear: 2026,
            whatsappNumber: '03001234567'
        });

    assert.equal(response.status, 201);
    assert.ok(response.body.token);
    assert.equal(response.body.user.email, testEmail);
    assert.equal(response.body.user.password, undefined);
    token = response.body.token;
    userId = response.body.user.id;
});

test('rejects protected requests without a token', async () => {
    const response = await request(app).get('/api/posts');
    assert.equal(response.status, 401);
});

test('creates and paginates a post', async () => {
    const response = await request(app)
        .post('/api/posts')
        .set('Authorization', `Bearer ${token}`)
        .send({
            title: 'Automated API test post',
            content: 'Created by the backend functional test suite.',
            universityTag: 'UOG',
            category: 'General'
        });

    assert.equal(response.status, 201);
    postId = response.body.post._id;

    const listResponse = await request(app)
        .get('/api/posts?page=1&limit=1')
        .set('Authorization', `Bearer ${token}`);

    assert.equal(listResponse.status, 200);
    assert.equal(listResponse.body.page, 1);
    assert.equal(listResponse.body.limit, 1);
    assert.ok(Number.isInteger(listResponse.body.total));
});

test('adds, validates, and reacts to a comment', async () => {
    const commentResponse = await request(app)
        .post(`/api/posts/${postId}/comment`)
        .set('Authorization', `Bearer ${token}`)
        .send({ text: 'Functional comment' });

    assert.equal(commentResponse.status, 201);
    commentId = commentResponse.body.post.comments.at(-1)._id;

    const invalidResponse = await request(app)
        .put(`/api/posts/${postId}/comments/${commentId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ text: '   ' });
    assert.equal(invalidResponse.status, 400);

    const reactionResponse = await request(app)
        .post(`/api/posts/${postId}/react`)
        .set('Authorization', `Bearer ${token}`)
        .send({ reactionType: 'Helpful' });
    assert.equal(reactionResponse.status, 200);
    assert.equal(reactionResponse.body.userReaction, 'Helpful');
});

test('rejects invalid reaction values and unknown routes safely', async () => {
    const reactionResponse = await request(app)
        .post(`/api/posts/${postId}/react`)
        .set('Authorization', `Bearer ${token}`)
        .send({ reactionType: 'Invalid' });
    assert.equal(reactionResponse.status, 400);

    const routeResponse = await request(app).get('/api/not-a-route');
    assert.equal(routeResponse.status, 404);
});