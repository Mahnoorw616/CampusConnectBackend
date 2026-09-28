require('dotenv').config();
const app = require('./app');
const connectDatabase = require('./config/db');
const port = Number(process.env.PORT) || 5000;
const host = process.env.HOST || '0.0.0.0';

const startServer = async () => {
  try {
    await connectDatabase();
    app.listen(port, host, () => {
      console.log(`CampusConnect API listening on http://${host}:${port}`);
      console.log('LAN access is enabled when the computer firewall allows the port.');
    });
  } catch (error) {
    console.error(`Unable to start CampusCrew API: ${error.message}`);
    process.exit(1);
  }
};

startServer();