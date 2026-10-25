const mongoose = require('mongoose');
const env = require('./env');

module.exports = async function connectDB() {
  mongoose.set('strictQuery', true);
  await mongoose.connect(env.mongoUri);
  console.log('MongoDB connected');
};
