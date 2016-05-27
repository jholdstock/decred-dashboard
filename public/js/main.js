$(function() {

  var lastBlockInterval;
  updateStats(true);
  setInterval(updateStats, 15000);

  function updateStats(isStartup) {

    var nonce = (new Date()).getTime();
    $.ajax({
      url : '/api/v1/get_stats?'+nonce,
      type: 'GET',
      success: function(response) {

        if (!response.error) {
          var usd_last = (response.btc_last * response.usd_price).toString().substr(0,4);
          var usd_prev = response.prev_day * response.usd_price;

          if (usd_prev <= response.btc_last * response.usd_price) {
            $('span.stats-lastprice')
              .html('$' + usd_last + '<span class="up">▴</span>');
          } else {
            $('span.stats-lastprice')
              .html('$' + usd_last + '<span class="down">▾</span>');
          }

          var btc_low = (response.btc_low).toString().substr(0,8);
          $('span.stats-daylow').text(btc_low);

          var btc_high = (response.btc_high).toString().substr(0,8);
          $('span.stats-dayhigh').text(btc_high);

          if (response.prev_day <= response.btc_last) {
            $('span.stats-btc')
              .html(response.btc_last + '<span class="up">▴</span>');
          } else {
            $('span.stats-btc')
              .html(response.btc_last + '<span class="down">▾</span>');
          }

          $('span.stats-btc-usd').text('$' + response.usd_price);

          var hashrate = (response.networkhashps / 1000 / 1000 / 1000 / 1000).toString().substr(0,5);
          $('span.stats-hashrate').html(hashrate);
          $('span.stats-blocks').html(numberFormat(response.blocks));
          $('span.stats-difficulty').html(numberFormat(Math.floor(response.difficulty)));
          $('span.stats-time').html('0' + response.average_minutes + ':' + response.average_seconds);
          clearInterval(lastBlockInterval);
          var lastTimeBlock = $('span.stats-lastblock-time');
          lastBlockInterval = setInterval(function() {
            console.log('Update blocktime: ' + new Date());
            var time = 0;
            var diff = Math.floor(new Date().getTime() /  1000) - Math.floor(response.last_block_datetime);

            var minutes = Math.floor(Math.floor(diff) / 60);
            minutes = minutes < 10 ? '0' + minutes : minutes;
            var seconds = (Math.round(diff) % 60);
            seconds = seconds < 10 ? '0' + seconds : seconds;

        		time = minutes + ' min ' + seconds + ' sec';
            lastTimeBlock.html(time + ' ago');
          }, 1000);

          var ticket_price = response.sbits.toString().substr(0,5);
          /* 2.00000001 -> 2.01
           * 2.09999999 -> 2.10
           */
          ticket_price = parseFloat(ticket_price);
          if (response.sbits > ticket_price) {
            ticket_price = Math.round((ticket_price + 0.01) * 100) / 100;
          }

          //$('span.real-pos-price').attr('title', response.sbits + ' DCR');
          $('span.stats-ticketprice').html(ticket_price + ' <span class="hidden-xs">DCR</span>');
          $('span.stats-poolsize').html(numberFormat(response.poolsize));
          $('span.stats-mempool').html(numberFormat(response.pooledtx));
          var avg_fee = response.fees ? response.fees.toString().substr(0,6) : 0;
          var max_fee = response.max_fees ? response.max_fees.toString().substr(0,6) : 0;
          $('span.stats-fees').html(avg_fee + ' <span class="hidden-xs">DCR</span>');

          var est_pos_blocks = 144 - (response.blocks % 144);
          var est_pos_time = secondsToTime(est_pos_blocks * response.average_time);

          $('.est-pos-time').html('in '+est_pos_time.hours+' hours '+est_pos_time.minutes+' minutes');
          $('.est-pos-blocks').html('<b>' + est_pos_blocks + '</b> blocks left');
          if (response.est_sbits <= response.prev_est_sbits) {
            $('.est-pos-price').html(response.est_sbits.toString().substr(0,5) + ' DCR');
          } else {
            $('.est-pos-price').html(response.est_sbits.toString().substr(0,5) + ' DCR');
          }
          $('.min-est-pos').html(response.est_sbits_min.toString().substr(0,5) + ' DCR');
          $('.max-est-pos').html(response.est_sbits_max.toString().substr(0,5) + ' DCR');

          var block_reward = getEstimatedBlockReward(Math.ceil(response.blocks / 6144) - 1, response.reward);
          $('.block-reward').html(block_reward.toString().substr(0,5) + ' DCR');
          $('.pow-block-reward').html('<span class="hidden-xs"><b>PoW-reward</b> </span><span class="visible-xs-block"><b>PoW</b> </span>' + (block_reward * 0.6).toString().substr(0,6) + ' DCR');
          $('.pos-block-reward').html('<span><b>PoS vote</span></b> ' + (block_reward * 0.3 / 5).toString().substr(0,6) + ' DCR');
          $('.dev-block-reward').html('<span class="hidden-xs"><b>Dev subsidy</b> </span><span class="visible-xs-block"><b>Devs</b> </span>' + (block_reward * 0.1).toString().substr(0,6) + ' DCR');

          var next_block_subsidy = getEstimatedBlockReward(Math.ceil(response.blocks / 6144), response.reward);
          $('.est-block-reward').html(next_block_subsidy.toString().substr(0,5) + ' DCR');

          var est_subsidy_blocks = 6144 - (response.blocks % 6144);
          var est_subsidy_time = secondsToTime(est_subsidy_blocks * response.average_time);
          if (est_subsidy_time.days) {
            $('.est-reward-time').html('in '+est_subsidy_time.days+' days '+est_subsidy_time.hours+' hours');
          } else {
            $('.est-reward-time').html('in '+est_subsidy_time.hours+' hours '+est_subsidy_time.minutes+' minutes');
          }
          $('.est-reward-blocks').html('<b>' + est_subsidy_blocks + '</b> blocks left');

          /***** Hints blocks *****/

          /* PoS tickets */

          // Average ticket price in the pool = amount of locked coins divide by number of tickets in the pool
          var avg_price_in_pool = Math.round((response.ticketpoolvalue / response.poolsize) * 100) / 100;

          var hint_title = '', hint_content = '';
          if (response.sbits <= response.avg_sbits) {
            if (response.est_sbits < response.sbits) {
              hint_title = '<span class="main-color">Don\'t buy</span> new PoS tickets right now';
              hint_content = 'Current ticket price <b>'+ticket_price+' DCR</b> is higher than next estimated ticket price '+response.est_sbits.toString().substr(0,5)+' DCR. <br>We suggest you to wait for the PoS-difficulty adjustment.';
            } else {
              hint_title = 'Good <span class="main-color">time to buy</span> new PoS tickets';
              hint_content = 'Current ticket price <b>'+ticket_price+' DCR</b> is lower than 30-days average price: '+response.avg_sbits.toString().substr(0,4)+' DCR. <br> Hurry up to take the best price.';
            }
          } else {
            hint_title = '<span class="main-color">Don\'t buy</span> new PoS tickets right now';
            hint_content = 'Current ticket price <b>'+ticket_price+' DCR</b> is higher than 30-days average price: '+response.avg_sbits.toString().substr(0,4)+' DCR. <br> We suggest you to wait for the PoS-difficulty adjustment.';
          }
          $('.avg-price').html(response.avg_sbits.toString().substr(0,4) + ' DCR');
          $('.hint-title').html(hint_title);
          $('.hint-content').html(hint_content);

          /* Mempool fees */
          // $('b.avg-fee').html(avg_fee + ' DCR');
          // $('b.max-fee').html(max_fee + ' DCR');

          /* Total locked DCR in PoS */
          $('.poolvalue').html(numberFormat(response.ticketpoolvalue) + ' DCR');

          var coinsupply = response.coinsupply / 100000000;
          var poolvalue_percent = ((response.ticketpoolvalue / coinsupply) * 100).toString().substr(0,5);
          $('.poolvalue-percent').html(poolvalue_percent + ' %');
          $('.avg-price-in-pos-pool').html(avg_price_in_pool + ' DCR');

           /***** Hints blocks end *****/

          /* Draw voters chart on page load */
          if (isStartup) {
            var voters = [{
                      name: '5 voters',
                      y: response.five_voters,
                      color: '#3498DB'
                  }, {
                      name: '4 voters',
                      y: response.four_voters,
                      color: '#E7A03C'
                  }, {
                      name: '3 voters',
                      y: response.three_voters,
                      color: '#E74C3C'
                  }];
            var missed = response.four_voters + 2 * response.three_voters;
            var total = 5 * (response.blocks - 4095);
            drawVotersChart(voters, missed, total);
          }

          /* Draw supply chart on page load */
          if (isStartup) {
            var max_reward = (response.blocks - 4095) * response.reward;
            // TODO: omg, check this math 10 times more
            var supply = {
              premine: 1680000,
              pow: response.mined_before_pos - (response.reward * 0.1 * 4095) + 0.6 * (response.blocks - 4095) * response.reward - 0.2 * 0.6 * missed * response.reward,
              pos: 0.06 * (total - missed) * response.reward,
              devs: (response.reward * 0.1 * 4095) + 0.1 * (response.blocks - 4095) * response.reward - 0.2 * 0.1 * missed * response.reward
            };
            drawSupplyChart(supply);
            var supply_total = Math.floor(1680000 + supply.pow + supply.pos + supply.devs);
            var percent_mined = (supply_total / 21000000 * 100).toString().substr(0,4);
            $('.mined_coins').html(numberFormat(supply_total));
            $('.percent_mined').html(percent_mined + '% ');
            $('.supply-progress .progress .progress-bar')
              .css('width', percent_mined + "%")
              .attr('aria-valuenow', percent_mined);
          }
        }
      }
    });
  };
});


$(function () {

    $('.glyphicon-question-sign').tooltip();
    var nonce = (new Date()).getTime();

    $('.pos-group .btn-chart').on('click', function(e) {
      e.preventDefault();
      var $this = $(this);
      var time = $this.data('period');
      var chart = $this.data('chart');

      var nonce = (new Date()).getTime();

      $this.parent().find('button').each(function(item) { $(this).removeClass('active'); });
      $this.addClass('active');

      $.ajax({
        url: '/api/v1/pos?data='+chart+'&time='+time+'&nonce='+nonce,
        type: 'GET',
        dataType: "json",
        success: function (data) {
          if (chart == 'sbits') {
            drawSbits(data.sbits);
          }
        }
      });
    });

    $('.price-group .btn-chart').on('click', function(e) {
      e.preventDefault();
      var $this = $(this);
      var ticker = $this.data('ticker');
      var chart = $this.data('chart');

      $('.price-chart-title').text('Decred Price, ' + ticker.toUpperCase());
      $this.parent().find('button').each(function(item) { $(this).removeClass('active'); });
      $this.addClass('active');
      updatePricesChart(ticker);
    });

    $.ajax({
      url: '/api/v1/pos?time=30&nonce='+nonce,
      type: 'GET',
      dataType: "json",
      success: function (data) {
        drawSbits(data.sbits);
      }
    });

    updatePricesChart('usd');
});

function updatePricesChart(ticker) {
  if (ticker != 'usd' && ticker != 'btc') {
    ticker = 'usd';
  }
  $.ajax({
    url: '/api/v1/prices',
    type: 'GET',
    data: {ticker : ticker},
    dataType: "json",
    success: function (data) {
      if (!data.error) {
        drawPrice(data, ticker);
      }
    }
  });
}

function getEstimatedBlockReward(cycles, reward) {
  if (cycles) {
    reward = reward * 100/101;
    return getEstimatedBlockReward(cycles - 1, reward);
  } else {
    return reward;
  }
}

function numberFormat(number) {
    return number.toString().replace(/(\d)(?=(\d\d\d)+([^\d]|$))/g, '$1 ');
}

function secondsToTime(secs) {
  var hours = Math.floor(secs / (60 * 60));

  var divisor_for_minutes = secs % (60 * 60);
  var minutes = Math.floor(divisor_for_minutes / 60);
  if (minutes < 10) {
    minutes = "0" + minutes.toString();
  }

  var days = 0;

  if (hours >= 24) {
    days = parseInt(hours / 24, 10);
    hours = hours - days * 24;
    minutes = 0;
  }

  return {"days" : days, "hours": hours, "minutes": minutes};
}
