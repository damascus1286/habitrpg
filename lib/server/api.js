// @see ./routes.coffee for routing

var _ = require('lodash');
var async = require('async');
var algos = require('habitrpg-shared/script/algos');
var helpers = require('habitrpg-shared/script/helpers');
var items = require('habitrpg-shared/script/items');
var validator = require('derby-auth/node_modules/validator');
var check = validator.check;
var sanitize = validator.sanitize;
var utils = require('derby-auth/utils');
var misc = require('../app/misc');
var derbyAuthUtil = require('derby-auth/utils');
var User = require('./models/user').model;

var api = module.exports;

/*
  ------------------------------------------------------------------------
  Misc
  ------------------------------------------------------------------------
*/


var NO_TOKEN_OR_UID = {err: "You must include a token and uid (user id) in your request"};

var NO_USER_FOUND = {err: "No user found." }

/*
  beforeEach auth interceptor
*/

api.auth = function(req, res, next) {
  var uid = req.headers['x-api-user'];
  var token = req.headers['x-api-key'];
  if (!(uid && token)) return res.json(401, NO_TOKEN_OR_UID);
  User.findOne({_id:uid, apiToken:token}, function(err, user){
    if (err) return res.json(500, {err: err});
    if (_.isEmpty(user)) return res.json(401, NO_USER_FOUND);
    if (!req.habit) req.habit = {};
    req.habit.user = user;
    return next();
  });
};

/*
  ------------------------------------------------------------------------
  Tasks
  ------------------------------------------------------------------------
*/


var addTask = function(user, task) {
  task.id = helpers.uuid();
  if (!task.type) task.type = 'habit';
  user.tasks[task.id] = task;
  user[task.type + "Ids"].unshift(task.id)
};

var deleteTask = function(user, task) {
  delete user.tasks[task.id];
  var taskIds = user[task.type + "Ids"];
  taskIds.splice(taskIds.indexOf(task.id), 1);
};

var score = function(user, taskId, direction) {
  return algos.score(user, user.tasks[taskId], direction);
};

/*
  This is called form deprecated.coffee's score function, and the req.headers are setup properly to handle the login
  Export it also so we can call it from deprecated.coffee
*/
api.scoreTask = function(req, res, next) {
  var direction, done, existing, id, task, user, _ref, _ref1, _ref2, _ref3;
  _ref = req.params, id = _ref.id, direction = _ref.direction;

  // Send error responses for improper API call
  if (!id) {
    return res.json(500, {err: ':id required'});
  }
  if (direction !== 'up' && direction !== 'down') {
    return res.json(500, {err: ":direction must be 'up' or 'down'"});
  }
  user = req.habit.user;
  done = function(err) {
    if (err) return res.json(500, {err:err});
    //# TODO - could modify batchTxn to conform to this better
    var delta = score(user, id, direction);
    return res.json(200, _.extend(user.stats.toObject(), {delta: delta}));
  };
  //# Set completed if type is daily or todo and task exists
  if (existing = user.tasks[id]) {
    if ((_ref1 = existing.get('type')) === 'daily' || _ref1 === 'todo') {
      return existing.set('completed', direction === 'up', done);
    } else {
      return done();
    }

  //# If it doesn't exist, this is likely a 3rd party up/down - create a new one
  } else {
    task = {
      id: id,
      value: 0,
      type: ((_ref2 = req.body) != null ? _ref2.type : void 0) || 'habit',
      text: ((_ref3 = req.body) != null ? _ref3.title : void 0) || id,
      notes: "This task was created by a third-party service. Feel free to edit, it won't harm the connection to that service. Additionally, multiple services may piggy-back off this task."
    };
    if (type === 'habit') {
      task.up = task.down = true;
    }
    if (type === 'daily' || type === 'todo') {
      task.completed = direction === 'up';
    }
    addTask(user, task);
    user.save(done);
  }
};

/*
  Get all tasks
*/
api.getTasks = function(req, res, next) {
  var tasks, types;
  types = /^(habit|todo|daily|reward)$/.test(req.query.type) ? [req.query.type] : ['habit', 'todo', 'daily', 'reward'];
  tasks = _.toArray(_.filter(req.habit.user.tasks, function(t) {
    return ~(types.indexOf(t));
  }));
  return res.json(200, tasks);
};

/*
  Get Task
*/
api.getTask = function(req, res, next) {
  var task = req.habit.user.tasks[req.params.id];
  if (_.isEmpty(task)) {
    return res.json(400, {err: "No task found."});
  }
  return res.json(200, task);
};

/*
  Validate task
*/
api.validateTask = function(req, res, next) {
  var completed, down, newTask, notes, task, text, type, up, value, _ref;
  task = {};
  newTask = (_ref = req.body, type = _ref.type, text = _ref.text, notes = _ref.notes, value = _ref.value, up = _ref.up, down = _ref.down, completed = _ref.completed, _ref);

  // # If we're updating, get the task from the user
  if (req.method === 'PUT' || req.method === 'DELETE') {
    task = req.habit.user.tasks[req.params.id];
    if (_.isEmpty(task)) return res.json(400, {err: "No task found."});

    type = undefined;
    delete newTask.type;
  } else if (req.method === 'POST') {
    newTask.value = sanitize(value).toInt();
    if (isNaN(newTask.value)) {
      newTask.value = 0;
    }
    if (!/^(habit|todo|daily|reward)$/.test(type)) {
      return res.json(400, {
        err: 'type must be habit, todo, daily, or reward'
      });
    }
  }
  if (typeof text === "string") {
    newTask.text = sanitize(text).xss();
  }
  if (typeof notes === "string") {
    newTask.notes = sanitize(notes).xss();
  }
  switch (type) {
    case 'habit':
      if (typeof up !== 'boolean') {
        newTask.up = true;
      }
      if (typeof down !== 'boolean') {
        newTask.down = true;
      }
      break;
    case 'daily':
    case 'todo':
      if (typeof completed !== 'boolean') {
        newTask.completed = false;
      }
  }
  _.extend(task, newTask);
  req.habit.task = task;
  return next();
};

/*
  Delete Task
*/
api.deleteTask = function(req, res, next) {
  return deleteTask(req.habit.user, req.habit.task, function() {
    return res.send(204);
  });
};

/*
  Update Task
*/
api.updateTask = function(req, res, next) {
  req.habit.user.tasks[req.habit.task.id] = req.habit.task;
  req.habit.user.save(function(err, user){
    if (err) return res.json(500,{err:err});
    return res.json(200, user.tasks[req.habit.task.id]);
  })
};

/*
  Update tasks (plural). This will update, add new, delete, etc all at once.
  Should we keep this?
*/
api.updateTasks = function(req, res, next) {
  throw("don't call me yet")
  var tasks, user;
  user = req.habit.user;
  tasks = req.body;
  _.each(tasks, function(task, idx) {
    if (task.id) {
      if (task.del) {
        delete user.tasks[task.id]
        // Delete from id list, only if type is passed up
        // TODO we should enforce they pass in type, so we can properly remove from idList
        var i;
        if (task.type && ~(i = user[task.type + "Ids"].indexOf(task.id))) {
          user[task.type + "Ids"].splice(i, 1);
        }
        tasks[idx] = {deleted: true};
      } else {
        user.tasks[task.id] = task;
      }
    } else {
      addTask(user, task);
    }
    tasks[idx] = task;
    return true;
  });
  user.save(function(err, user){
    res.json(201, tasks);
  })
};

api.createTask = function(req, res, next) {
  addTask(req.habit.user, req.habit.task);
  req.habit.user.save(function(err, user){
    if (err) return res.json(500, {err:err});
    res.json(201, user.tasks[req.habit.task.id]);
  });
};

api.sortTask = function(req, res, next) {
  var a, from, id, path, to, type, user, _ref;
  id = req.params.id;
  _ref = req.habit.task, to = _ref.to, from = _ref.from, type = _ref.type;
  user = req.habit.user;
  path = type + "Ids";
  user[path].splice(to, 0, user[path].splice(from, 1)[0]);
  user[path] = a
  user.save(next);
};

/*
  ------------------------------------------------------------------------
  Items
  ------------------------------------------------------------------------
*/


api.buy = function(req, res, next) {
  var done, hasEnough, type;
  type = req.params.type;
  if (type !== 'weapon' && type !== 'armor' && type !== 'head' && type !== 'shield') {
    return res.json(400, {
      err: ":type must be in one of: 'weapon', 'armor', 'head', 'shield'"
    });
  }
  hasEnough = true;
  done = function() {
    if (hasEnough) {
      return res.json(200, req.habit.user.items);
    } else {
      return res.json(200, {
        err: "Not enough GP"
      });
    }
  };
  return misc.batchTxn(req.getModel(), function(uObj, paths) {
    return hasEnough = items.buyItem(uObj, type, {
      paths: paths
    });
  }, {
    user: req.habit.user,
    done: done
  });
};

/*
  ------------------------------------------------------------------------
  User
  ------------------------------------------------------------------------
*/


/*
  Registers a new user. Only accepting username/password registrations, no Facebook
*/
api.registerUser = function(req, res, next) {
  var confirmPassword, email, model, password, username, _ref;
  _ref = req.body, email = _ref.email, username = _ref.username, password = _ref.password, confirmPassword = _ref.confirmPassword;
  if (!(username && password && email)) {
    return res.json(401, {
      err: ":username, :email, :password, :confirmPassword required"
    });
  }
  if (password !== confirmPassword) {
    return res.json(401, {
      err: ":password and :confirmPassword don't match"
    });
  }
  try {
    validator.check(email).isEmail();
  } catch (e) {
    return res.json(401, {
      err: e.message
    });
  }
  model = req.getModel();
  return async.waterfall([
    function(cb) {
      return model.query('users').withEmail(email).fetch(cb);
    }, function(user, cb) {
      if (user.get()) {
        return cb("Email already taken");
      }
      return model.query('users').withUsername(username).fetch(cb);
    }, function(user, cb) {
      var id, newUser, salt;
      if (user.get()) {
        return cb("Username already taken");
      }
      newUser = helpers.newUser(true);
      salt = utils.makeSalt();
      newUser.auth = {
        local: {
          username: username,
          email: email,
          salt: salt
        }
      };
      newUser.auth.local.hashed_password = derbyAuthUtil.encryptPassword(password, salt);
      newUser.auth.timestamps = {
        created: +(new Date)
      };
      req._isServer = true;
      return id = model.add("users", newUser, function(err) {
        return cb(err, id);
      });
    }
  ], function(err, id) {
    if (err) {
      return res.json(401, {
        err: err
      });
    }
    return res.json(200, model.get("users." + id));
  });
};

/*
  Get User
*/
api.getUser = function(req, res, next) {
  var user = req.habit.user.toObject();
  user.stats.toNextLevel = algos.tnl(user.stats.lvl);
  user.stats.maxHealth = 50;
  delete user.apiToken;
  if (user.auth) {
    delete user.auth.hashed_password;
    delete user.auth.salt;
  }
  user.id = user._id;
  return res.json(200, user);
};

/*
  Register new user with uname / password
*/
api.loginLocal = function(req, res, next) {
  var model, password, q, username, _ref;
  _ref = req.body, username = _ref.username, password = _ref.password;
  if (!(username && password)) {
    return res.json(401, {
      err: 'No username or password'
    });
  }
  model = req.getModel();
  q = model.query("users").withUsername(username);
  return q.fetch(function(err, result1) {
    var u1;
    if (err) {
      return res.json(401, {
        err: err
      });
    }
    u1 = result1.get();
    if (!u1) {
      return res.json(401, {
        err: 'Username not found'
      });
    }
    //# We needed the whole user object first so we can get his salt to encrypt password comparison
    q = model.query("users").withLogin(username, utils.encryptPassword(password, u1.auth.local.salt));
    return q.fetch(function(err, result2) {
      var u2;
      if (err) {
        return res.json(401, {
          err: err
        });
      }
      u2 = result2.get();
      if (!u2) {
        return res.json(401, {
          err: 'Incorrect password'
        });
      }
      return res.json(200, {
        id: u2.id,
        token: u2.apiToken
      });
    });
  });
};

/*
  POST /user/auth/facebook
*/
api.loginFacebook = function(req, res, next) {
  var email, facebook_id, model, name, q, _ref;
  _ref = req.body, facebook_id = _ref.facebook_id, email = _ref.email, name = _ref.name;
  if (!facebook_id) {
    return res.json(401, {
      err: 'No facebook id provided'
    });
  }
  model = req.getModel();
  q = model.query("users").withProvider('facebook', facebook_id);
  return q.fetch(function(err, result) {
    var u;
    if (err) {
      return res.json(401, {
        err: err
      });
    }
    u = result.get();
    if (u) {
      return res.json(200, {
        id: u.id,
        token: u.apiToken
      });
    } else {
      // # FIXME: create a new user instead
      return res.json(403, {
        err: "Please register with Facebook on https://habitrpg.com, then come back here and log in."
      });
    }
  });
};

/*
  Update user
  FIXME add documentation here
*/


api.updateUser = function(req, res, next) {
  var acceptableAttrs, series, user;
  user = req.habit.user;

//  # FIXME we need to do some crazy sanitiazation if they're using the old `PUT /user {data}` method.
//  # The new `PUT /user {'stats.hp':50}
//
//  # FIXME - one-by-one we want to widdle down this list, instead replacing each needed set path with API operations
//  # Note: custom is for 3rd party apps
  acceptableAttrs = 'tasks achievements filters flags invitations items lastCron party preferences profile stats tags custom'.split(' ');
  _.each(req.body, function(v, k) {
    if ((_.find(acceptableAttrs, function(attr) {
      return k.indexOf(attr) === 0;
    }))) {
      helpers.dotSet(k,v,user);
    }
  });
  user.save(function(err, user){
    if (err) return res.json(500,{err:err});
    res.json(200, helpers.derbyUserToAPI(user));
  });
};

api.cron = function(req, res, next) {
  var user;
  user = req.habit.user;
  return misc.batchTxn(req.getModel(), function(uObj, paths) {
    uObj = helpers.derbyUserToAPI(uObj, {
      asScope: false
    });
    return algos.cron(uObj, {
      paths: paths
    });
  }, {
    user: user,
    done: next,
    cron: true
  });
};

api.revive = function(req, res, next) {
  var done, user;
  user = req.habit.user;
  done = function() {
    return res.json(200, helpers.derbyUserToAPI(user));
  };
  return misc.batchTxn(req.getModel(), function(uObj, paths) {
    return algos.revive(uObj, {
      paths: paths
    });
  }, {
    user: user,
    done: done
  });
};

/*
  ------------------------------------------------------------------------
  Batch Update
  Run a bunch of updates all at once
  ------------------------------------------------------------------------
*/


api.batchUpdate = function(req, res, next) {
  var actions, oldJson, oldSend, performAction, user, _ref;
  user = req.habit.user;
  oldSend = res.send;
  oldJson = res.json;
  performAction = function(action, cb) {
//    # TODO come up with a more consistent approach here. like:
//    # req.body=action.data; delete action.data; _.defaults(req.params, action)
//    # Would require changing action.dir on mobile app
    var _ref;
    req.params.id = (_ref = action.data) != null ? _ref.id : void 0;
    req.params.direction = action.dir;
    req.params.type = action.type;
    req.body = action.data;
    res.send = res.json = function(code, data) {
      if (_.isNumber(code) && code >= 400) {
        console.error({
          code: code,
          data: data
        });
      }
      //#FIXME send error messages down
      return cb();
    };
    switch (action.op) {
      case "score":
        return api.scoreTask(req, res);
      case "buy":
        return api.buy(req, res);
      case "sortTask":
        return api.sortTask(req, res);
      case "addTask":
        return api.validateTask(req, res, function() {
          return api.createTask(req, res);
        });
      case "delTask":
        return api.validateTask(req, res, function() {
          return api.deleteTask(req, res);
        });
      case "set":
        return api.updateUser(req, res);
      case "revive":
        return api.revive(req, res);
      default:
        return cb();
    }
  };
  //# Setup the array of functions we're going to call in parallel with async
  actions = _.transform((_ref = req.body) != null ? _ref : [], function(result, action) {
    if (!_.isEmpty(action)) {
      return result.push(function(cb) {
        return performAction(action, cb);
      });
    }
  });
  //# call all the operations, then return the user object to the requester
  async.series(actions, function(err) {
    res.json = oldJson;
    res.send = oldSend;
    if (err) {
      return res.json(500, {
        err: err
      });
    }
    res.json(200, helpers.derbyUserToAPI(user));
    return console.log("Reply sent");
  });
};
