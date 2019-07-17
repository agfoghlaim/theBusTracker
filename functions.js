//const fs = require('fs');
const axios = require('axios');
const config = require('./config');
const mongoose = require('mongoose');
const BusRoute = require('./modals/busRoute');
const Snapshot = require('./modals/snapshot');

mongoose.connect(config.MONGO_URI,{useNewUrlParser:true})

module.exports = {

  //take in a time and a number
  //subtract number*mins from time
  //return new time
  subtractMins: function(time, numMins){
    
    const oneMinuteInMilliseconds = 60000;
    const hr = time.substr(0,2)
    const min = time.substr(3,2);
    numMins = numMins*oneMinuteInMilliseconds;
    
    let date = new Date();
  
    date.setHours(hr)
    date.setMinutes(min)
    date = date.valueOf() - numMins;
  
    let hrOut = new Date(date).getHours()
    let minOut = new Date(date).getMinutes()
  
    let output = {hr:hrOut, min:minOut}
    //console.log(output.hr.toString().length, output.min.toString().length)
    if(output.hr.toString().length === 1){
      output.hr = output.hr.toString().padStart(2, '0')
    }
    if(output.min.toString().length === 1){
      output.min = output.min.toString().padStart(2, '0')
    }
    return output
  },
  
  getDayOfWeek: function(){
    let dayNumber = new Date().getDay();
    let day = {};
    
      if(dayNumber > 0 && dayNumber < 6){
        day =  {dayName:'bus_times_week', dayNumber:dayNumber};
      }else if(dayNumber === 0 ){
        day =  {dayName:'bus_times_sun', dayNumber:dayNumber};
      }else if(dayNumber === 6 ){
        day =  {dayName:'bus_times_sat', dayNumber:dayNumber};
      }else{
        day = 'err'
      }
     return day
  },

  //take in 2 times
  //check if they're within numMinutes of each other
  isWithinMinutesOf: function(busLoadTime,beTime,numMinutes){
 
    let theirDate = new Date();
    let myDate = new Date();
    
    theirDate.setHours(beTime.substr(0,2))
    theirDate.setMinutes(beTime.substr(3,2))
    
    myDate.setHours(busLoadTime.substr(0,2))
    myDate.setMinutes(busLoadTime.substr(3,2))

    //subtract the largest time from the smallest time
    var diff = Math.max(theirDate.valueOf(), myDate.valueOf()) - Math.min(theirDate.valueOf(), myDate.valueOf()); 

    diff = diff/1000/60

    //is the difference less than numMinutes???
    return (diff <= numMinutes)? true : false;
  },

  
  calculateHowEarlyOrLateBusIs: function(sch, act){
    let schTime = new Date();
    let actTime = new Date();
    
    schTime.setHours(sch.substr(0,2))
    schTime.setMinutes(sch.substr(3,2))
    
    actTime.setHours(act.substr(0,2))
    actTime.setMinutes(act.substr(3,2))
    
    let diff = Math.max(schTime.valueOf(), actTime.valueOf()) - Math.min(schTime.valueOf(), actTime.valueOf());
    diff = diff/1000/60
    if(schTime.valueOf() > actTime.valueOf()){
      return {status:'early', mins:diff}
    }else if(schTime.valueOf() < actTime.valueOf()){
      return {status:'late', mins:diff}
    }else{
      return {status:'ontime', mins:diff}
    }

  },
  isEarlyOrLate:function(sch,act){
    var schTime = new Date();
    var actTime = new Date();
    
    schTime.setHours(sch.substr(0,2))
    schTime.setMinutes(sch.substr(3,2))
    
    actTime.setHours(act.substr(0,2))
    actTime.setMinutes(act.substr(3,2))
    
    if(schTime.valueOf() > actTime.valueOf()){
      return "early"
    }else if(schTime.valueOf() < actTime.valueOf()){
      return "late"
    }else{
      return "on time"
    }
  },

 
  getWeatherDetails: function(){
    console.log("WEATHER CALL COUNT ")
    return new Promise((resolve,reject)=>{

      //coordinates for Eyre Square 
      axios.get('https://api.darksky.net/forecast/3832809d10204e77f82e89932e7e3228/53.2747740041651,-9.04875088331228')
      .then(res=>{
        console.log("got weather")
        let currentWeather = {
          lastUpdated: res.data.currently.time,
          precipIntensity: res.data.currently.precipIntensity,
          precipProbability: res.data.currently.precipProbability,
          summary: res.data.currently.summary,
          icon: res.data.currently.icon
        }
        resolve(currentWeather);
      })
      .catch(e=>reject("weather error", e))
    })
  },
  
  //check if 5 mins has passed since weather was last updated
  shouldUpdateNow: function(lastUpdated){
    const fiveMinsInMilliSeconds = 300000;
    let now = Date.now();
    (lastUpdated - now > fiveMinsInMilliSeconds) ? true : false 
  },
  
  saveToMongo: function(stuffToSave){
    return new Promise((resolve,reject)=>{
      console.log("stuff to save for... ", stuffToSave.route,stuffToSave.direction,stuffToSave.stop, stuffToSave.bestopid)
      const {route, direction, bestopid} = stuffToSave;

      BusRoute.updateOne(
        { route: route, direction:direction,  "stops.bestopid": bestopid},
        { $push: 
            {"stops.$.snapshots": 
                stuffToSave
            }
        }
      )
      .exec()
      .then(d=>resolve(d))
      .catch(e=>reject(e))
    })
  },
  saveToMongoNew:  async function(stuffToSave){
    //return new Promise((resolve,reject)=>{
    
      const {route, direction, bestopid} = stuffToSave;
      console.log("stuff to save for... ", route,direction,bestopid);

      //get the _id of the bus stop
      let newStuffToSave = stuffToSave;
      newStuffToSave._id =  new mongoose.Types.ObjectId();

      stop_id = await BusRoute.aggregate([
          {$match: {route:route,direction:direction}},
          {$unwind: '$stops'},
          {$match: {'stops.bestopid':bestopid}},
          {$replaceRoot: { newRoot: "$stops" }},
          {$project:{_id:1}}
       ])

       newStuffToSave['stopRef'] = stop_id[0]._id;
       //console.log("newStuffToSave['stop_id']", newStuffToSave.stop_id)
    
       let saveSnap = new Snapshot(newStuffToSave)
       let snapSaved = await saveSnap.save();
       //console.log("snapSaved ", snapSaved);
       return snapSaved;

  }

}

