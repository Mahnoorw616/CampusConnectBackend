const notFound = (req, res) => res.status(404).json({ success: false, message: `Route not found: ${req.method} ${req.originalUrl}` });

const errorHandler = (error, _req, res, _next) => {
  console.error(error);
  if (error.type === 'entity.too.large' || error.status === 413) {
    return res.status(413).json({
      success: false,
      message: 'Request payload is too large. Use a smaller file.'
    });
  }
  if (error.name === 'ValidationError') return res.status(400).json({ success: false, message: Object.values(error.errors).map((item) => item.message).join(', ') });
  if (error.name === 'CastError') return res.status(400).json({ success: false, message: 'Invalid resource ID' });
  if (error.code === 11000) {
    const duplicateField = Object.keys(error.keyPattern || {})[0];
    const message = duplicateField === 'email'
      ? 'A user with that email already exists'
      : duplicateField === 'postId'
        ? 'This user already has a reaction on this post'
        : duplicateField === 'commentId'
          ? 'This user already has a reaction on this comment'
          : 'A record with the same unique value already exists';
    return res.status(409).json({ success: false, message });
  }
  if (error.statusCode) {
    return res.status(error.statusCode).json({
      success: false,
      message: error.message
    });
  }
  return res.status(500).json({ success: false, message: process.env.NODE_ENV === 'production' ? 'Internal server error' : error.message });
};

module.exports = { notFound, errorHandler };
