const mongoose = require('mongoose');

const mongoWeatherSchema = mongoose.Schema(

  {
    lastUpdated: String,
    precipIntensity: Number,
    summary: String,
    icon: String
  }
    
  )

const snapShotSchema = mongoose.Schema({
  _id:mongoose.Types.ObjectId,
  stopRef:mongoose.Types.ObjectId,
  queryScheduledTime: String,
  dayOfWeek: String,
  queryDateTime: String,
  forBusDue: String,
  route: String,
  direction:String,
  stop: String,
  bestopid: String,
  busname:String,
  timetabled:String,
  actual:String,
  earlyOrLate:String,
  minutesOff:String,
  weather: mongoWeatherSchema
})





module.exports = mongoose.model('Snapshot', snapShotSchema);