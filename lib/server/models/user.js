var mongoose = require('mongoose');
var Schema = mongoose.Schema;

var UserSchema = new Schema({
  _id: String,
  apiToken: String,
  achievements:  {
    helpedHabit: Boolean,
    originalUser: Boolean,
    ultimateGear: Boolean
    //TODO add the rest
  },

  auth: {
    facebook: Schema.Types.Mixed,
    local: {
      email: String,
      hashed_password: String,
      salt: String,
      username: String
    },
    timestamps: {
      created: Date,
      loggedin: Date
    }
  }, // TODO make this more precise
  backer: {
    tier: Number,
    admin: Boolean,
    contributor: Boolean
  },
  balance: Number,

  habitIds: Array,
  dailyIds: Array,
  todoIds: Array,
  rewardIds: Array,

  filters: Schema.Types.Mixed, //TODO

  flags : {
    ads : String, //FIXME to boolean (currently show/hide)
    dropsEnabled : Boolean,
    itemsEnabled : Boolean,
    newStuff : String, //FIXME to boolean (currently show/hide)
    partyEnabled : Boolean,
    petsEnabled : Boolean,
    rest : Boolean // FIXME remove?
  },

  history: {
    exp: [{date: Date, value: Number}],
    todos: [{data:Date, value: Number}]
  },

  invitations: { // FIXME remove?
    guilds: Array
  },

  items: {
    armor: Number,
    weapon: Number,
    head: Number,
    shield: Number,
    currentPet: { //FIXME - tidy this up, not the best way to store current pet
      text: String, //Cactus
      name: String, //Cactus
      value: Number, //3
      notes: String, //"Find a hatching potion to pour on this egg, and one day it will hatch into a loyal pet.",
      modifier: String, //Skeleton
      str: String //Cactus-Skeleton
    },
    eggs: [
      {
        text : String, //"Wolf",
        name : String, //"Wolf",
        value : Number, //3
        notes : String, //"Find a hatching potion to pour on this egg, and one day it will hatch into a loyal pet.",
        type : String, //"Egg",
        dialog : String //"You've found a Wolf Egg! Find a hatching potion to pour on this egg, and one day it will hatch into a loyal pet." },
      }
    ],
    hatchingPotions: Array, // ["Base", "Skeleton",...]
    lastDrop : {
      date : Date,
      count : Number
    },
    pets: Array // ["BearCub-Base", "Cactus-Base", ...]
  },

  lastCron: Date,

  party: { // FIXME remove?
    current: String, //party._id FIXME make these populate docs?
    invitation: String, //party._id
    lastMessageSeen : String, //party._id
    leader : Boolean
  },

  preferences : {
    armorSet : String, //"v2",
    dayStart : Number, //"0", FIXME do we need a migration for this?
    gender : String, // "m",
    hair : String, //"blond",
    hideHeader : Boolean, //false,
    showHelm : Boolean, //true,
    skin : String, //"white",
    timezoneOffset : Number //240
  },

  profile : {
    blurb : String, //"I made Habit. Don't judge me! It'll get better, I promise",
    imageUrl : String, //"https://sphotos-a-lga.xx.fbcdn.net/hphotos-ash4/1004403_10152886610690144_825305769_n.jpg",
    name : String, //"Tyler",
    websites : Array //["http://ocdevel.com" ]
  },

  stats: {
    hp: Number,
    exp: Number,
    gp: Number,
    lvl: Number
  },


  tags: [
    {
      id: String, // FIXME use refs?
      name: String // "pomodoro"
    }
  ],

  tasks: Schema.Types.Mixed //FIXME - definitely define this!
    // history: {date, value}
    // id
    // notes
    // tags { "4ddf03d9-54bd-41a3-b011-ca1f1d2e9371" : true },
    // text
    // type
    // up
    // down
    // value
    // completed
    // priority: '!!'
    // repeat {m: true, t: true}
    // streak
});

module.exports.schema = UserSchema;
module.exports.model = mongoose.model('User', UserSchema);