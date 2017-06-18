"use strict";

var express = require('express');
var request = require('request');
var moment  = require('moment');
var CronJob = require('cron').CronJob;
var fs = require('fs');

var api = require('./routes/api.js');
var site = require('./routes/site.js');
var env = process.env.NODE_ENV || 'development';
var config = require('./config/config.json')[env];

var dcr_profile = require("./public/strings/dcr-profile.json");
var gnt_profile = require("./public/strings/gnt-profile.json");
var profiles = [ dcr_profile, gnt_profile]

var strings = profiles[0];

var app = express();
app.set('views', './public/views');
app.set('view engine', 'jade');
app.locals.moment = moment;

console.log('Starting app in ' + env + ' environment.');
var p = "";
for (var i = 0; i < profiles.length; i++) {
  p += profiles[i].alt_ticker + " ";

}
console.log("Profiles: " + p)
// in production we are using Nginx to deliver static files
if (env == 'development') {
  app.use(express.static('public'));
}

var sequelize = require('./models').sequelize;
var Stats = require('./models').Stats;
var Prices = require('./models').Prices;

app.use('/api/v1', api);
app.use('', site); // site must go last because it contains catchall for 404

const MARKET_CAP = 'https://graphs.coinmarketcap.com/currencies/';
const POLONIEX = 'https://poloniex.com/public?command=returnTicker';
const BITSTAMP = 'https://www.bitstamp.net/api/v2/ticker/btcusd/';
const FOREX_API = 'http://api.fixer.io/latest?base=USD';

function getUsdBtcPrice(next) {
  request(BITSTAMP, function (error, response, body) {
    if (error || response.statusCode != 200) {
       return next(error, null);
    }

    try {
      var data2 = JSON.parse(body);
    } catch(e) {
      return next(e,null);
    }

    if (!data2) {
      return next(body,null);
    }

    var usdbtc_price = parseFloat(data2.last);

    return next(null, usdbtc_price);
  });
}

var updateStats = function() {
  getUsdBtcPrice(function(err, usdbtc_price) {
    if (err) {
      console.error(err);
      return;
    }

    getPrices(function(err, resp) {
      if (err) {
        console.error(err);
        return;
      }
      
      var newRows = [];

      for (var i = 0; i < profiles.length; i++) {
        var data = resp[profiles[i].polo_id];
        if (!data) {
          console.error("No data for profile: " + profiles[i].alt_ticker)
          continue;
        }

        var result = {};
        result.ticker = profiles[i].alt_ticker;
        result.usd_price = usdbtc_price;
        
        result.btc_high = data['high24hr'];
        result.btc_low = data['low24hr'];
        result.btc_last = data['last'];
        result.btc_volume = data['baseVolume'];
        result.prev_day = (parseFloat(data['percentChange']) * 100).toFixed(2);
        newRows.push(result);
      }

      for (var i = 0; i < newRows.length; i++) {
        console.log("updateStats: writing " + newRows[i].ticker + " stats");
        Stats.upsert(newRows[i]).catch(function(err) {
          console.error(err);
        });
      }
    });    
  });

}

var updateMarketCap = function() {
  getMarketCap();
  updatePricesTable();
}

// Original timings
 new CronJob('*/15 * * * * *', updateStats, null, true, 'Europe/Rome');
// new CronJob('0 */15 * * * *', updateMarketCap, null, true, 'Europe/Rome');
// new CronJob('5 */60 * * * *', updateExchangeRates, null, true, 'Europe/Rome');

new CronJob('*/10 * * * * *', updateMarketCap, null, true, 'Europe/Rome');

function getPrices(next) {
  // Get BTC/ALT from polo
  request(POLONIEX, function (error, response, body) {
    if (!error && response.statusCode == 200) {

      try {
        var data = JSON.parse(body);
      } catch(e) {
        return next(e,null);
      }

      return next(null, data);
    } else {
      return next(error, null);
    }
  });

}

function getMarketCap() {
  for (var i = 0; i < profiles.length; i++) {
    request(MARKET_CAP + profiles[i].market_cap_id, function (error, response, body) {
      if (!error && response.statusCode == 200) {
        try {
          var file_name = this.profile.alt_ticker+"-market-cap.json";
          let json = JSON.parse(body);
          json = JSON.stringify({usd_price : json.price_usd, btc_price : json.price_btc});
          fs.writeFile("./uploads/"+file_name, json, function(err) {
              if(err) {
                  return console.error(err);
              }
              return console.log("updateMarketCap: Saved market cap data in " + file_name);
          });

        } catch(e) {
          console.error('updateMarketCap: ', e); return;
        }
      }
    }.bind({profile: profiles[i]}));
  }
}

function updatePricesTable() {
  Stats.findAll().then(function(stats) {
    if (stats == null) {
      console.error("updateMarketCap: nothing in stats table. Cant update 15 min price");
      return;
    }
    
    var newRows = [];
    for (var i=0; i < stats.length; i++) {
      var data = {
        ticker: stats[i].ticker,
        alt_btc : stats[i].btc_last,
        btc_usd : stats[i].usd_price,
        alt_usd : (stats[i].btc_last * stats[i].usd_price),
        datetime : Math.floor(new Date().getTime() / 1000)
      };
      newRows.push(data);
    }
    
    return Prices.bulkCreate(newRows).then(function(rows) {
      console.log('updateMarketCap: Saved 15-mins market price ' + rows[0].ticker + rows[0].alt_usd);
      console.log('updateMarketCap: Saved 15-mins market price ' + rows[1].ticker + rows[1].alt_usd);
    }).catch(function(err) {
      console.error(err);
    });

  }).catch(function(err) {
    console.error(err);
  });
}

function updateExchangeRates() {
  request(FOREX_API, function (error, response, body) {
    if (!error && response.statusCode == 200) {
      try {
        JSON.parse(body);
      } catch(e) {
        console.error('Bad response from forex provider', e);
        return;
      }

      fs.writeFile("./uploads/rates.json", body, function(err) {
          if(err) {
              return console.error(err);
          }
          return console.log("USD foreign exchange rates updated.");
      });

    } else {
      console.log('Bad response from forex provider', response);
    }
  });
}

app.listen(config.listen_port, function () {
  console.log('Listening on port ' + config.listen_port);
});
module.exports = app;
