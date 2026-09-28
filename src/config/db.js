const mongoose = require('mongoose');
const migrateLegacyData = require('./migrateLegacyData');

const connectDatabase = async () => {
  if (!process.env.MONGO_URI) throw new Error('MONGO_URI is not configured. Add it to your .env file.');
  mongoose.set('strictQuery', true);
  await mongoose.connect(process.env.MONGO_URI);
  await migrateLegacyData();
  console.log('MongoDB connected');
};

module.exports = connectDatabase;
