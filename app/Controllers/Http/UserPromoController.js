"use strict";

const Redis = use("Redis");
const moment = require("moment");
const { prepareUserForClient } = require("../../Helpers");

class UserPromoController {
  /**
   * Render a form to be used for creating a new userpromo.
   * GET userpromos/create
   *
   * @param {object} ctx
   * @param {Request} ctx.request
   * @param {Response} ctx.response
   * @param {View} ctx.view
   */
  async create({ auth, request, response }) {
    try {
      let { code } = request.all();
      let user = await auth.getUser();

      // if (user.fingerprint) {
      //   let fingerDoubleUsers = await Redis.scard(user.fingerprint);
      //   if (fingerDoubleUsers > 2)
      //     throw new Error("Активация невозможна <br/> Причина: мультиакаунт");
      // }

      let redisExistPromo = await Redis.hmget(`promos`, code);
      if (!redisExistPromo[0]) throw new Error("Промокод не найден");
      let existPromo = JSON.parse(redisExistPromo);

      let isActivated = await Redis.sismember(
        `users:${user.id}:promos`,
        JSON.stringify(existPromo.id)
      );

      if (isActivated) {
        throw new Error("Промокод уже активирован");
      }

      if (moment(existPromo.expire) < moment()) {
        throw new Error("Истек срок действия промокода");
      }

      if (existPromo.used >= existPromo.max) {
        throw new Error("Исчерпан лимит активаций промокода");
      }

      await Redis.sadd(
        `users:${user.id}:promos`,
        JSON.stringify(existPromo.id)
      );

      existPromo.used = existPromo.used ? parseInt(existPromo.used) + 1 : 1;

      await Redis.hmset(`promos`, existPromo.code, JSON.stringify(existPromo));

      let timestamp = moment()
        .format("YYYY-MM-DD HH:mm:ss")
        .toString();
      await Redis.hmset(
        `users:${user.id}:log`,
        `promo:${timestamp}`,
        JSON.stringify({
          operation: `Активация промокода ${existPromo.code}`,
          before: user.money,
          after: user.money + parseInt(existPromo.weight),
          created_at: timestamp,
          updated_at: timestamp
        })
      );

      user.money += parseInt(existPromo.weight);
      user.treshold += parseInt(existPromo.treshold);
      await user.save();

      const userPromoIds = await Redis.smembers(`users:${user.id}:promos`);
      const promos = [];

      let cachedPromos = await Redis.hgetall("promos");
      Object.keys(cachedPromos).forEach(key => {
        promos.push(JSON.parse(cachedPromos[key]));
      });

      const bonus = promos
        .filter(promo => userPromoIds.includes(promo.id + ""))
        .reduce((sum, promo) => sum + parseInt(promo.weight), 0);

      response.status(200).json({
        type: "success",
        message: "Промокод успешно активирован",
        data: {
          bonus: bonus,
          treshold: user.treshold,
          user: prepareUserForClient(user)
        }
      });
    } catch (err) {
      if (err.name === "InvalidJwtToken") err.message = "Вы не авторизованы";
      response.status(500).json({
        message: err.message
      });
    }
  }
}

module.exports = UserPromoController;
