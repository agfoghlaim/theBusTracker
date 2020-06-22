const mongoose = require('mongoose');
const BusRoute = require('./modals/busRoute');
const timetables = require('./timetablesOut.json');
const cron = require('node-cron');
const helpers = require('./functions');
const axios = require('axios');

/*
mongoose.connect(config.MONGO_URI,{useNewUrlParser:true})
*/

function mapThem() {
  let newTimetablesOut = timetablesOut.map((route) => {
    let newRoute = { ...route };
    newRoute._id = new mongoose.Types.ObjectId();

    let newStops = newRoute.stops.map((stop) => {
      let newStop = { ...stop };
      newStop._id = new mongoose.Types.ObjectId();
      return newStop;
    });

    newRoute.stops = [...newStops];

    return newRoute;
  });

  newTimetablesOut.forEach((route) => {
    let saveRoute = new BusRoute(route);
    saveRoute
      .save()
      .then((r) => console.log(r))
      .catch((e) => console.log(e));
  });
}

/*==========================

mapThem makes the routes in timetablesOut.json mongodb friendly and saves them all. To use change name of 'timetables' import to 'timetablesOut'
Also this function should not be here, it should be in the "moveSnapshots" project

UNCOMMENT WITH CAUTION
//mapThem();


=====================================*/

//

/*=======================================

Below here is copied from old cron project, only difference is it calls 'helpers.saveToMongoNew()' and is connected to the new db

=======================================*/

//what day is today? weekday, sat or sunday?
const day = helpers.getDayOfWeek();

let theCurrentWeather = undefined;

let getCurrentWeather = helpers.getWeatherDetails();

getCurrentWeather
  .then((weather) => (theCurrentWeather = weather))
  .catch((e) => console.log('init weather prob'));
cron.schedule('*/5 * * * *', () => {
  console.log('running a task every 5 minutes');
  let weather = helpers.getWeatherDetails();
  weather
    .then((weather) => {
      theCurrentWeather = weather;
    })
    .catch((e) => console.log('couldnt get weather ', e));
});

/*
-below forEach will set up a query for every bus on whatever day type const day is...bus_times_week/bus_times_sat/bus_times_sun

-the queries will run 2 mins before the buses are due to arrive each stop

*/

timetables.forEach((route) => {
  route.stops.forEach((stop) => {
    //run query 2 mins before
    stop[day.dayName].forEach((bus) => {
      let hour = bus.time.substr(0, 2);
      let min = bus.time.substr(3, 2);
      let dayNo = day.dayNumber;
      let queryTime = helpers.subtractMins(bus.time, 2);

      createCron(
        queryTime.hr,
        queryTime.min,
        dayNo,
        route.route,
        route.direction,
        stop.name,
        stop.bestopid,
        bus.bus,
        bus.time
      );
    });
    //console.log("There should be this many queryies: ", stop[day.dayName].length)
  });
});

function createCron(
  hr,
  min,
  dayNo,
  route,
  direction,
  stop,
  stopId,
  busname,
  due
) {
  cron.schedule(
    `0 ${min} ${hr} 1-31 1-12 ${dayNo}`,
    () => {
      //console.log(`running a query for... ${route} ${stop} ${stopId} ${busname} ${due}`);

      let queryResponse = makeRequest(stopId, route);

      queryResponse
        .then((res) => {
          let relevantBus = findBus(res.results, due, route);
          let theTime = new Date().toString();

          let stuffToSave = {
            weather: theCurrentWeather,
            queryScheduledTime: `${hr}:${min}`,
            dayOfWeek: new Date().toString().substring(0, 3),
            queryDateTime: theTime,
            forBusDue: due,
            route: route,
            direction: direction,
            stop: stop,
            bestopid: stopId,
            busname: busname,
            timetabled: 'bus_not_found_on_rtpi',
            actual: 'bus_not_found_on_rtpi',
            earlyOrLate: 'bus_not_found_on_rtpi',
            minutesOff: 'bus_not_found_on_rtpi',
          };

          if (relevantBus !== false) {
            let earlyOrLate = helpers.isEarlyOrLate(
              relevantBus.scheduleddeparturedatetime.substr(11, 5),
              relevantBus.departuredatetime.substr(11, 5)
            );
            let howEarlyLate = helpers.calculateHowEarlyOrLateBusIs(
              relevantBus.scheduleddeparturedatetime.substr(11, 5),
              relevantBus.departuredatetime.substr(11, 5)
            );

            stuffToSave.timetabled = relevantBus.scheduleddeparturedatetime;
            stuffToSave.actual = relevantBus.departuredatetime;
            stuffToSave.earlyOrLate = earlyOrLate;
            stuffToSave.minutesOff = howEarlyLate.mins.toString();
          }

          let saveData = helpers.saveToMongoNew(stuffToSave);
          saveData
            .then((res) => console.log('snapshot saved?, nModified: ', res))
            .catch((err) => console.log('error saving snapshot:', err));
        })
        .catch((err) =>
          console.log('Error with queryResponse/makeRequest ', err)
        );
    },
    {
      scheduled: true,
      timezone: 'Europe/Dublin',
    }
  ); //end cron
}

function makeRequest(stopid, routeid) {
  //want to get sceduleddeparturedatetime Vs departuredatetime (departureduetime is in mins)

  // let url = `https://rtpiapp.rtpi.openskydata.com/RTPIPublicService_v2/service.svc/realtimebusinformation?stopid=${stopid}&routeid=${routeid}&format=json`;

  // June 2020, this one works now.
  const url = `https://data.smartdublin.ie/cgi-bin/rtpi/realtimebusinformation?stopid=${stopid}&routeid=${routeid}&format=json`;

  // Also June 2020, This request is returning an error "Parse Error: Invalid header value char", see here...'https://github.com/nodejs/node/issues/27711
  // Since the server is still on node v 10.something I will try it there before fixing.
  return new Promise((resolve, reject) => {
    axios
      .get(url)
      .then(function (response) {
        console.log("numResults for ", routeid, response.data.results.length);
        resolve(response.data);
      })
      .catch(function (error) {
        reject('RTPI Query Error... ', error);
      })
      .finally(function () {});
  });
}

// function will find the relevant bus in the array of results from the RTPI (RTPI will have responded with the next few busses due, not just the one we're looking for)
function findBus(routesArray, due) {
  // querys scheduled to run 2 mins before departure times, so subtract 2 mins from due
  let newDue = helpers.subtractMins(due, 2);
  newDue = `${newDue.hr}:${newDue.min}`;

  let relevantRoute = routesArray.filter((route) => {
    helpers.isWithinMinutesOf(
      route.scheduleddeparturedatetime.substr(11, 5),
      newDue,
      2
    );

    return helpers.isWithinMinutesOf(
      newDue,
      route.scheduleddeparturedatetime.substr(11, 5),
      3
    );
  });

  // relevantRoute should always be length = 1;
  // 0 means the bus being queried for is not on the RTPI for that stop
  return relevantRoute.length === 1 ? relevantRoute[0] : false;
}
