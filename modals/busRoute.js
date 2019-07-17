const mongoose = require('mongoose');

const busTimesSchema = mongoose.Schema({
  bus: String,
  time: String,
})


const busStopSchema = mongoose.Schema({
  _id: mongoose.Schema.Types.ObjectId,
  name: String,
  bestopid: String,
  stop_sequence: String,
  bus_times_week:[busTimesSchema],
  bus_times_sat: [busTimesSchema],
  bus_times_sun:[busTimesSchema],
})

const busRoutesSchema = mongoose.Schema({
  _id: mongoose.Schema.Types.ObjectId,
  route: String,
  routename: String,
  direction: String,
  stops: [busStopSchema]
})


module.exports = mongoose.model('BusRoute', busRoutesSchema);