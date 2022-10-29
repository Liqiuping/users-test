/*
 * @Topic: 
 * @Author: liqiuping
 * @Date: 2022-09-25 18:30:49
 * @LastEditors: liqiuping
 * @LastEditTime: 2022-09-26 22:42:38
 */
var express = require("express");
var router = express.Router();
var md5 = require("md5");
var MongoClient = require("mongodb").MongoClient;
const { redisClient } = require("../redis");
const { v4: uuidv4 } = require("uuid");
const fs = require("fs"); // 引入文件系统模块

// 初始化
router.get("/initGroupDatabase", function (req, res, next) {
  getSemanticGroups().then(
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
                  groups: [],
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

// 新增分组
router.get("/addGroup", function (req, res, next) {
  const prefix = "新增分组错误：";
  const { token, name } = req.query;
  if (token === "dawnSneezeSafe") {
    if ( name) {
      getSemanticGroups().then(
        (groups) => {
          const groupsArr = groups.map((u) => u.name);
          if (groupsArr.includes(name)) {
            res.json({
              error: null,
              message: prefix + "【name】分组已存在!",
            });
          } else {
            const id = uuidv4();
            groups.push({
              name,
              id,
              semantic: {},
            });
            updateSemanticGroups(groups).then(
              () => {
                fs.mkdirSync(path.join(__dirname, "raw/groups/" + name));
                
                res.send({
                  state: STATE_SUCCESS,
                  data: null,
                  message: "新增分组成功!",
                });
              },
              (error) => {
                res.json({
                  state: STATE_FAIL,
                  error,
                  message: prefix + "更新分组表异常！",
                });
              }
            );
          }
        },
        (error) => {
          res.json({
            state: STATE_FAIL,
            error,
            message: prefix + "获取分组表异常！",
          });
        }
      );
    } else {
      res.json({
        state: STATE_FAIL,
        error,
        message: "参数不完整，请输入参数【name】!",
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

// 删除分组
router.get("/deleteGroup", function (req, res, next) {
  const prefix = "删除分组错误：";
  const { token, name } = req.query;
  if (token === "dawnSneezeSafe") {
    if (name) {
      getSemanticGroups().then(
        (groups) => {
          const result = groups.filter((u) => u.name !== name);
          updateSemanticGroups(result).then(
         
            () => {
              //文件路径
              const oldSrc = path.join(
                __dirname,
                "public/raw/groups/" + name
              );
              const newSrc = path.join(
                __dirname,
                "public/raw/groups/DELETE_" + name + Date.parse(new Date())
              );
              //文件重命名
              fs.rename(oldSrc, newSrc, function (err) {
                if (err) {
                  fileOptFlag = "用户文件夹操作异常，请手动处理！";
                }

                res.send({
                  state: STATE_SUCCESS,
                  data: fileOptFlag,
                  message: "删除用户成功!",
                });
              });
            },
            (error) => {
              res.json({
                state: STATE_FAIL,
                error,
                message: prefix + "更新分组表异常！",
              });
            }
          );
        },
        (error) => {
          res.json({
            state: STATE_FAIL,
            error,
            message: prefix + "获取分组表异常！",
          });
        }
      );
    } else {
      res.json({
        state: STATE_FAIL,
        error,
        message: "参数不完整，请输入参数【name】!",
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



const getSemanticGroups = function () {
  return new Promise((resolve, reject) => {
    redisClient.get(GROUP_DATA_REDIS_KEY, (err, redisUsers) => {
      if (redisUsers) {
        resolve(redisUsers);
      } else {
        MongoClient.connect(
          mongodbURL,
          { useNewUrlParser: true },
          function (err, db) {
            if (err) {
              reject(err);
              db.close();
            } else {
              const database = db.db(DATABASE_NAME);
              database
                .collection(COLLECTION_NAME)
                .find({ dataID })
                .toArray(function (err, result) {
                  if (err || !result[0]) {
                    reject(err);
                  } else {
                    if (result[0] && result[0].data.groups) {
                      const { groups } = result[0].data;
                      redisClient.set(GROUP_DATA_REDIS_KEY, groups);
                      resolve(groups);
                    } else {
                      reject(new Error("分组数据表异常！"));
                    }
                  }
                  db.close();
                });
            }
          }
        );
      }
    });
  });
};
const updateSemanticGroups = function (groups) {
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
                  data: { groups },
                },
              },
              function (err, result) {
                if (err) {
                  reject(err);
                } else {
                  redisClient.set(GROUP_DATA_REDIS_KEY, groups);
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

// TODO: 注意地址

const GROUP_DATA_REDIS_KEY = "GROUP_DATA_REDIS_KEY";
//TODO
// const mongodbURL = "mongodb://localhost:27017/semanticProgram";
const mongodbURL = "mongodb://192.168.1.9:27017/semanticProgram";
const STATE_FAIL = "fail";
const STATE_SUCCESS = "success";
let dataID = "semantic-group";
const DATABASE_NAME = "semanticProgram";
const COLLECTION_NAME = "semanticGroups";

module.exports = router;
