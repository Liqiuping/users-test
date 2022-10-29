var redis = require("redis");
// TODO
 // var redisClient = redis.createClient(6379, "192.168.1.9", {
var redisClient = redis.createClient(6379, "localhost", {
  auth_pass: "dawnSneezeSafe",
}); //端口号、主机

//docker run --restart=always --log-opt max-size=100m --log-opt max-file=2 -p 6379:6379 --name redis -v /d/work/redis/config/redis.conf:/etc/redis/redis.conf -v /d/work/redis/data:/data -d redis redis-server /etc/redis/redis.conf  --appendonly yes  --requirepass dawnSneezeSafe

// 配置redis的监听事件
// 准备连接redis-server事件
redisClient
  .on("ready", function () {
    console.log("Redis client: ready");
  })
  .on("connect", function () {
    console.log(new Date(), "redis is now connected!");
  })
  .on("reconnecting", function () {
    console.log(new Date(), "redis reconnecting", arguments);
  })
  .on("end", function () {
    console.log("Redis Closed!");
  })
  .on("warning", function () {
    console.log("Redis client: warning", arguments);
  })
  .on("error", function (err) {
   // logger.error("Redis Error " + err);
    console.error("Redis Error " + err);
  });

//导出redis-client对象
module.exports = { redisClient };
