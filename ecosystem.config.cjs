module.exports = {
  apps: [
    {
      name: 'finvestserver',
      script: 'src/index.js',
      watch: false,
      env: {
        DB: "mongodb+srv://itfinvestcorp:gQ6C7bkHG15ovp7E@finvestcluster.yn8wkxz.mongodb.net/finvest",
        KEY: "gfnfgnrfbb"
      }
    }
  ]
};
