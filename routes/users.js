var express = require("express");
var router = express.Router();
var md5 = require("md5");
var MongoClient = require("mongodb").MongoClient;
const { redisClient } = require("../redis");
const { v4: uuidv4 } = require("uuid");
const fs = require("fs"); // 引入文件系统模块

var path = require("path");

// 初始化
router.get("/initUserDatabase", function (req, res, next) {
  getSemanticUsers().then(
    () => {
      res.send({
        state: STATE_FAIL,
        error: null,
        message: "初始化已完成，无法再次初始化！",
      });
    },
    () => {
      MongoClient.connect(
        mongodbURL,
        { useNewUrlParser: true },
        function (error, db) {
          if (error) {
            res.send({
              state: STATE_FAIL,
              message: "初始化失败!",
              error,
            });
          } else {
            var dbase = db.db(DATABASE_NAME);
            dbase.collection(COLLECTION_NAME).insertOne(
              {
                dataID,
                data: {
                  users: [],
                },
              },
              function (error) {
                if (error) {
                  res.send({
                    state: STATE_FAIL,
                    message: "初始化失败,请重试!",
                    error,
                  });
                } else {
                  res.send({
                    state: STATE_SUCCESS,
                    data: null,
                    message: "初始化成功!",
                  });
                }
              }
            );
          }
        }
      );
    }
  );
});

// 管理：新增用户
router.get("/addUser", function (req, res, next) {
  const prefix = "新增用户错误：";
  const { token, account, name, password: rawPwd } = req.query;
  if (token === "dawnSneezeSafe") {
    if (account && name && rawPwd) {
      getSemanticUsers().then(
        (users) => {
          const accountArr = users.map((u) => u.account);
          if (accountArr.includes(account)) {
            res.json({
              error: null,
              message: prefix + "【account】账号已存在!",
            });
          } else {
            const id = uuidv4();
            const password = md5(rawPwd);
            users.push({
              account,
              name,
              password,
              id,
              group: [],
              semantic: {},
            });
            updateSemanticUsers(users).then(
              () => {
                handleUserFile("add", { id });
                res.send({
                  state: STATE_SUCCESS,
                  data: null,
                  message: "新增用户成功!",
                });
              },
              (error) => {
                res.json({
                  state: STATE_FAIL,
                  error,
                  message: prefix + "更新用户表异常！",
                });
              }
            );
          }
        },
        (error) => {
          res.json({
            state: STATE_FAIL,
            error,
            message: prefix + "获取用户表异常！",
          });
        }
      );
    } else {
      res.json({
        state: STATE_FAIL,
        error,
        message: "参数不完整，请输入参数【account】【name】【password】!",
      });
    }
  } else {
    res.json({
      state: STATE_FAIL,
      error,
      message: "没有权限!",
    });
  }
});
// 管理：删除用户
router.get("/deleteUser", function (req, res, next) {
  const prefix = "删除用户错误：";
  const { token, account } = req.query;
  if (token === "dawnSneezeSafe") {
    if (account) {
      getSemanticUsers().then(
        (users) => {
          let del;
          const result = users.filter((u) => {
            if (u.account === account) {
              del = u;
            }
            return u.account !== account;
          });
          updateSemanticUsers(result).then(
            () => {
              handleUserFile("delete", del || {});
              res.send({
                state: STATE_SUCCESS,
                data: null,
                message: "删除用户成功!",
              });
            },
            (error) => {
              res.json({
                state: STATE_FAIL,
                error,
                message: prefix + "更新用户表异常！",
              });
            }
          );
        },
        (error) => {
          res.json({
            state: STATE_FAIL,
            error,
            message: prefix + "获取用户表异常！",
          });
        }
      );
    } else {
      res.json({
        state: STATE_FAIL,
        error,
        message: "参数不完整，请输入参数【account】!",
      });
    }
  } else {
    res.json({
      state: STATE_FAIL,
      error,
      message: "没有权限!",
    });
  }
});
// 管理：登出
router.get("/logout", function (req, res, next) {
  const { token, id } = req.query;
  if (token === "dawnSneezeSafe") {
    redisClient.del(id);
    res.send({
      state: STATE_SUCCESS,
      data: null,
      message: "登出!",
    });
  } else {
    res.json({
      state: STATE_FAIL,
      error,
      message: "没有权限!",
    });
  }
});
// 管理：清除用户列表缓存
router.get("/clear", function (req, res, next) {
  const { token, id } = req.query;
  if (token === "dawnSneezeSafe") {
    redisClient.del(USER_DATA_REDIS_KEY);
    res.send({
      state: STATE_SUCCESS,
      data: null,
      message: "清理!",
    });
  } else {
    res.json({
      state: STATE_FAIL,
      error,
      message: "没有权限!",
    });
  }
});
// 判断登录: 登录存在缓存中
router.post("/status", function (req, res, next) {
  const hour = new Date().getHours();
  const validHour = [9, 18];
  if (hour > validHour[0] && hour < validHour[1]) {
    const { token: curToken, id } = req.body.data;
    handleRedis(
      "get",
      {
        key: id,
      },
      async (err, data) => {
        if (data) {
          if (data.token === curToken) {
            res.send({
              state: STATE_SUCCESS,
              data: true,
              message: "登录有效!",
            });
          } else {
            res.send({
              state: STATE_FAIL,
              data: false,
              message: "该账户正被占用！",
            });
          }
        } else {
          res.send({
            state: STATE_FAIL,
            data: false,
            message: "登录失效!",
          });
        }
      }
    );
  } else {
    res.send({
      state: STATE_FAIL,
      data: false,
      message: "无法登录!",
    });
  }
 
});
// 登录
router.post("/login", function (req, res, next) {
  const prefix = "登录错误：";
  getSemanticUsers().then(
    (users) => {
      const { account, password } = req.body.data;
      const user = users.find((u) => u.account === account);
      if (user) {
        const { id } = user;
        console.log('????', id);
        if (password === user.password) {
          handleRedis(
            "get",
            {
              key: user.id,
            },
            async (err, data) => {
              if (data) {
                res.json({
                  state: STATE_FAIL,
                  error: null,
                  message: prefix + "该账户正被占用！",
                });
              }
              const token = md5(
                user.id.slice(0, 6) + (Math.random() * 1000000).toFixed()
              );
              // const accessRawToken = md5(
              //   user.id.slice(0, 5) + (Math.random() * 10000000).toFixed()
              // );
              // const accessResultToken = md5(
              //   user.id.slice(0, 5) + (Math.random() * 10000000).toFixed()
              // );
              handleRedis("set", { key: id, value: { token } });
              redisClient.expire(id, 60 * 60 * 24 * 1);

              res.json({
                state: STATE_SUCCESS,
                data: { token, id }, //accessToken 用于拿到资源
                message: "登录成功！",
              });
            }
          );
        } else {
          res.json({
            state: STATE_FAIL,
            error: null,
            message: prefix + "密码错误！",
          });
        }
      } else {
        res.json({
          state: STATE_FAIL,
          error: null,
          message: prefix + "账号不存在",
        });
      }
    },
    (error) => {
      res.json({
        state: STATE_FAIL,
        error,
        message: prefix + "获取用户表异常！",
      });
    }
  );
});
// 登出
router.post("/logout", function (req, res, next) {
  const { id } = req.body.data;
  redisClient.del(id);
  res.send({
    state: STATE_SUCCESS,
    data: null,
    message: "登出!",
  });
});

const getSemanticUsers = function () {
  return new Promise((resolve, reject) => {
    handleRedis(
      "get",
      {
        key: USER_DATA_REDIS_KEY,
      },
      (err, redisUsers) => {
        if (redisUsers) {
          resolve(redisUsers);
        } else {
          MongoClient.connect(
            mongodbURL,
            { useNewUrlParser: true },
            function (err, db) {
              if (err) {
                reject(err);
                if (db) db.close();
              } else {
                const database = db.db(DATABASE_NAME);
                database
                  .collection(COLLECTION_NAME)
                  .find({ dataID })
                  .toArray(function (err, result) {
                    if (err || !result[0]) {
                      reject(err);
                    } else {
                      if (result[0] && result[0].data.users) {
                        const { users } = result[0].data;
                        handleRedis("set", {
                          key: USER_DATA_REDIS_KEY,
                          value: users,
                        });

                        resolve(users);
                      } else {
                        reject(new Error("用户数据表异常！"));
                      }
                    }
                    db.close();
                  });
              }
            }
          );
        }
      }
    );
  });
};
const updateSemanticUsers = function (users) {
  return new Promise((resolve, reject) => {
    MongoClient.connect(
      mongodbURL,
      { useNewUrlParser: true },
      function (err, db) {
        if (err) {
          reject(err);
        } else {
          db.db(DATABASE_NAME)
            .collection(COLLECTION_NAME)
            .updateOne(
              { dataID },
              {
                $set: {
                  data: { users },
                },
              },
              function (err, result) {
                if (err) {
                  reject(err);
                } else {
                  handleRedis("set", {
                    key: USER_DATA_REDIS_KEY,
                    value: users,
                  });
                  resolve(result);
                }
                db.close();
              }
            );
        }
      }
    );
  });
};
const handleRedis = function (type, { key, value }, cb) {
  if (type === "get") {
    redisClient.get(key, (e, data) => {
      cb(e, JSON.parse(data));
    });
  } else if (type === "set") {
    redisClient.set(key, JSON.stringify(value));
  }
};
const handleUserFile = function (type, { id, account }) {
  if (!id) {
    return;
  }
  if (type === "add") {
    fs.mkdirSync(path.join(__dirname, "../public/raw/users/" + id));
    // fs.mkdirSync(path.join(__dirname, "../public/result/users/" + id));
    // fs.mkdirSync(path.join(__dirname, "../public/result/common/" + id));
  } else if (type === "delete") {
    //文件重命名
    const postFix = Date.parse(new Date());
    const oldRaw = path.join(__dirname, "../public/raw/users/" + id);
    const oldResult1 = path.join(__dirname, "../public/result/users/" + id);
    const oldResult2 = path.join(__dirname, "../public/result/common/" + id);
    if (fs.existsSync(oldRaw)) {
      fs.renameSync(
        oldRaw,
        path.join(__dirname, "../public/raw/users/DELETE_" + account + postFix)
      );
    }
    if (fs.existsSync(oldResult1)) {
        fs.renameSync(
          oldResult1,
          path.join(
            __dirname,
            "../public/result/users/DELETE_" + account + postFix
          )
        );
    }
    if (fs.existsSync(oldResult2)) {
       fs.renameSync(
         oldResult2,
         path.join(
           __dirname,
           "../public/result/common/DELETE_" + account + postFix
         )
       );
    }
    
  
    

  }
};

const USER_DATA_REDIS_KEY = "USER_DATA_REDIS_KEY";
// TODO
// const mongodbURL = "mongodb://localhost:27017/semanticProgram";
const mongodbURL = "mongodb://192.168.1.9:27011/semanticProgram";

const STATE_FAIL = "fail";
const STATE_SUCCESS = "success";
let dataID = "semantic-users";
const DATABASE_NAME = "semanticProgram";
const COLLECTION_NAME = "semanticUsers";

module.exports = router;
