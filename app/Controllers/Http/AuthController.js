"use strict";

/** @type {import('@adonisjs/framework/src/Hash')} */
const User = use("App/Models/User");
const { validate } = use("Validator");
const Mail = use("Mail");
const axios = require("axios");
const Env = use("Env");
const jwt_decode = require("jwt-decode");
var Chance = require("chance");
const { prepareUserForClient } = require("../../Helpers");
const Logger = use("Logger");
const QueryString = require("query-string");

class AuthController {
  async register({ request, auth, response }) {
    try {
      const chance = new Chance();
      const rules = {
        username: "required|unique:users",
        email: "required|email|unique:users,email",
        password: "required"
      };
      const messages = {
        "username.unique": `Логин "${request.input("username")}" уже занят`,
        "email.email": "Введите корректный Email"
      };
      const validation = await validate(request.all(), rules, messages);

      if (validation.fails()) {
        return response.status(401).json(validation.messages());
      }

      const username = request.input("username");
      const email = request.input("email");
      const password = request.input("password");
      let referedBy = request.input("referedBy");
      const fphash = request.input("fphash");

      let user = new User();
      user.username = username;
      user.email = email;
      user.money = 0;
      user.password = password;
      user.avatar = `https://vk.com/images/camera_100.png?ava=1`;
      user.referal_code = chance.string({
        length: 14,
        pool: "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
      });
      user.fingerprint = fphash && fphash !== 'null' ? fphash : null;

      const userSameFingerprint = await User.findBy("fingerprint", fphash);
      if (userSameFingerprint) {
        referedBy = null;
      }

      if (referedBy !== null) {
        try {
          user.refered_by = (await User.findBy("referal_code", referedBy)).id;
        } catch (err) {
          Logger.error(err.message, err);
        }
      }

      await user.save();
      await user.logs().create({
        ip: request.ip()
      });

      let accessToken = await auth.generate(user);
      return response.json({
        user: prepareUserForClient(user),
        token: accessToken.token
      });
    } catch (err) {
      Logger.error(err.message, err);
    }
  }

  async login({ request, auth, response }) {
    const username = request.input("username");
    const password = request.input("password");
    const fphash = request.input("fphash");

    let status = 401;
    try {
      let data = await auth.attempt(username, password);
      let user = await User.findBy("username", username);

      user.fingerprint = fphash && fphash !== 'null' ? fphash : null;
      await user.save();

      await user.logs().create({
        ip: request.ip()
      });
      status = 200;

      return response.status(status).json({
        user: prepareUserForClient(user),
        token: data.token
      });
    } catch (err) {
      Logger.error(err.message, err);
      return response.status(status).json({
        message: "Введены некоректные данные."
      });
    }
  }

  async validate({ request, auth, response }) {
    try {
      const user = await auth.getUser();
      return response.status(200).json({
        user: prepareUserForClient(user)
      });
    } catch (error) {
      response.status(401).json({
        message: "Token Error!"
      });
    }
  }

  async verifyEmail({ request, response }) {
    try {
      let chance = new Chance();
      let { email } = request.all();
      let verifyCode = chance.string({
        length: 16,
        pool: "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
      });

      await Mail.send("emails.verify", { code: verifyCode }, message => {
        message
          .to(email)
          .from("stepx100.fun@gmail.com")
          .subject("Код подтверждения");
      });

      response.status(200).json({
        message:
          "Код подтверждения сгенерирован <br/> и выслан на указанную вами почту",
        code: verifyCode
      });
    } catch (err) {
      response.status(500).json({
        message:
          "Во время регистрации произошла ошибка.<br/> Пожалуйста, попробуйте позже."
      });
      Logger.error(err.message, err);
    }
  }

  async vk({ request, auth, response }) {
    try {
      const chance = new Chance();
      let { code, fphash, referedBy } = request.all();
      const redirect_uri = Env.get("CLIENT_URL");
      const client_id = Env.get("VK_CLIENT_ID");
      const client_secret = Env.get("VK_CLIENT_SECRET");
      const access_url = `https://oauth.vk.com/access_token?client_id=${client_id}&client_secret=${client_secret}&code=${code}&scope=email&redirect_uri=${redirect_uri}`;
      const access = await axios.get(access_url);
      const { access_token, user_id } = access.data;
      const fields = "uid,first_name,last_name,screen_name,photo_100,photo_200";
      const userUrl = `https://api.vk.com/method/users.get?uids=${user_id}&fields=${fields}&access_token=${access_token}&v=5.92`;
      const userData = await axios.get(userUrl);
      const {
        id,
        first_name,
        last_name,
        screen_name,
        photo_100,
        photo_200
      } = userData.data.response[0];

      let user = await User.findBy("vk", id);
      if (user) {
        user.fingerprint = fphash && fphash !== 'null' ? fphash : null;
        user.avatar = photo_100;
        await user.save();

        await user.logs().create({
          ip: request.ip()
        });
        let accessToken = await auth.generate(user);
        response.status(200).json({
          user: prepareUserForClient(user),
          token: accessToken.token
        });
        return true;
      }

      let newUser = new User();

      newUser.username = screen_name;
      newUser.email = `${screen_name}@example.com`;
      newUser.password = chance.string({
        length: 16,
        pool: "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
      });
      newUser.avatar = photo_200;
      newUser.vk = id;
      newUser.money = 0;
      newUser.f_name = first_name;
      newUser.l_name = last_name;
      newUser.referal_code = chance.string({
        length: 14,
        pool: "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
      });
      newUser.fingerprint = null;

      const userSameFingerprint = await User.findBy("fingerprint", fphash);
      if (userSameFingerprint && fphash !== 'null') {
        referedBy = fphash;
      }

      if (typeof referedBy == "string") {
        newUser.refered_by = (await User.findBy("referal_code", referedBy)).id;
      }

      await newUser.save();
      await newUser.logs().create({
        ip: request.ip()
      });
      let accessToken = await auth.generate(newUser);

      response.status(200).json({
        user: prepareUserForClient(newUser),
        token: accessToken.token
      });
    } catch (err) {
      Logger.error(err.message, err);
    }
  }

  async google({ request, response, auth }) {
    try {
      const chance = new Chance();
      let { code, referedBy, fphash } = request.all();
      const urlToken = `https://www.googleapis.com/oauth2/v4/token`;
      const parameters = {
        code: code,
        client_id: Env.get("GOOGLE_CLIENT_ID"),
        client_secret: Env.get("GOOGLE_CLIENT_SECRET"),
        redirect_uri: "postmessage",
        grant_type: "authorization_code"
      };
      const token = await axios.post(urlToken, parameters);
      const data = jwt_decode(token.data.id_token);

      let existUser = await User.findBy("google", data.sub);
      if (existUser) {
        existUser.fingerprint = fphash && fphash !== 'null' ? fphash : null;
        existUser.f_name = data.given_name;
        existUser.l_name = data.family_name;
        existUser.avatar = data.picture;

        await existUser.save();

        await existUser.logs().create({
          ip: request.ip()
        });
        let accessToken = await auth.generate(existUser);
        return response.status(200).json({
          user: prepareUserForClient(existUser),
          token: accessToken.token
        });
      }

      let existUserByEmail = await User.findBy("email", data.email);
      if (existUserByEmail) {
        existUserByEmail.fingerprint = fphash && fphash !== 'null' ? fphash : null;
        existUserByEmail.f_name = data.given_name;
        existUserByEmail.l_name = data.family_name;
        existUserByEmail.avatar = data.picture;

        await existUser.save();

        await existUserByEmail.logs().create({
          ip: request.ip()
        });
        let accessToken = await auth.generate(existUserByEmail);
        return response.status(200).json({
          user: prepareUserForClient(existUserByEmail),
          token: accessToken.token
        });
      }

      let user = new User();
      user.username = data.sub;
      user.email = data.email;
      user.money = 0;
      user.password = data.at_hash;
      user.avatar = data.picture;
      user.google = data.sub;
      user.f_name = data.given_name;
      user.l_name = data.family_name;
      user.referal_code = chance.string({
        length: 14,
        pool: "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
      });
      user.fingerprint = fphash && fphash !== 'null' ? fphash : null;

      const userSameFingerprint = await User.findBy("fingerprint", fphash);
      if (userSameFingerprint && fphash !== 'null') {
        referedBy = null;
      }

      if (referedBy !== null) {
        try {
          user.refered_by = (await User.findBy("referal_code", referedBy)).id;
        } catch (err) {
          Logger.error(err.message, err);
        }
      }

      await user.save();
      await user.logs().create({
        ip: request.ip()
      });

      let accessToken = await auth.generate(user);
      return response.json({
        user: prepareUserForClient(user),
        token: accessToken.token
      });
    } catch (err) {
      response.status(500).json({
        type: "error",
        message: err.message
      });
      Logger.error(err.message, err);
    }
  }

  async facebook({ request, response, auth }) {
    try {
      const chance = new Chance();
      let { code, id, referedBy, fphash } = request.all();
      const fields = "first_name,last_name,email,picture";
      const urlToken = `https://graph.facebook.com/v3.3/${id}?access_token=${code}&fields=${fields}`;
      const userData = await axios.get(urlToken);

      let existUser = await User.findBy("fb", userData.data.id);
      if (existUser) {
        existUser.avatar = userData.data.picture.data.url;
        existUser.f_name = userData.data.first_name;
        existUser.l_name = userData.data.last_name;
        existUser.fingerprint = fphash && fphash !== 'null' ? fphash : null;

        await existUser.save();

        await existUser.logs().create({
          ip: request.ip()
        });
        let accessToken = await auth.generate(existUser);
        return response.status(200).json({
          user: prepareUserForClient(existUser),
          token: accessToken.token
        });
      }

      if (userData.data.email) {
        let existUserByEmail = await User.findBy("email", userData.data.email);
        if (existUserByEmail) {
          existUserByEmail.avatar = userData.data.picture.data.url;
          existUserByEmail.f_name = userData.data.first_name;
          existUserByEmail.l_name = userData.data.last_name;
          existUserByEmail.fingerprint = fphash && fphash !== 'null' ? fphash : null;

          await existUserByEmail.logs().create({
            ip: request.ip()
          });
          let accessToken = await auth.generate(existUserByEmail);
          return response.status(200).json({
            user: prepareUserForClient(existUserByEmail),
            token: accessToken.token
          });
        }
      }

      let user = new User();
      user.username = userData.data.id;
      user.email = userData.data.email
        ? userData.data.email
        : `${userData.data.id}@fb.com`;
      user.money = 0;
      user.password = chance.string({ length: 16 });
      user.avatar = userData.data.picture.data.url;
      user.fb = userData.data.id;
      user.f_name = userData.data.first_name;
      user.l_name = userData.data.last_name;
      user.referal_code = chance.string({
        length: 14,
        pool: "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
      });
      user.fingerprint = fphash;

      const userSameFingerprint = await User.findBy("fingerprint", fphash);
      if (userSameFingerprint && fphash !== 'null') {
        referedBy = null;
      }

      if (referedBy !== null) {
        try {
          user.refered_by = (await User.findBy("referal_code", referedBy)).id;
        } catch (err) {
          Logger.error(err.message, err);
        }
      }

      await user.save();
      await user.logs().create({
        ip: request.ip()
      });

      let accessToken = await auth.generate(user);
      return response.json({
        user: prepareUserForClient(user),
        token: accessToken.token
      });
    } catch (err) {
      response.status(500).json({
        type: "error",
        message: err.message
      });
      Logger.error(err.message, err);
    }
  }

  async steam({ auth, request, response }) {
    try {
      const chance = new Chance();
      let { claimed_id, referedBy, fphash } = request.all();
      const reqData = {
        key: Env.get("STEAM_API_KEY"),
        format: "json",
        steamids: claimed_id
      };
      const apiUrl =
        "https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/";
      const res = await axios.get(
        `${apiUrl}?${QueryString.stringify(reqData)}`
      );
      const playerData = res.data.response.players[0];
      if (playerData === undefined)
        throw new Error("Ошибка при получении данных с сервера Steam");
      const existUser = await User.findBy("steam", playerData.steamid);
      if (existUser) {
        existUser.username = playerData.steamid;
        existUser.avatar = playerData.avatarmedium;
        existUser.fingerprint = fphash && fphash !== 'null' ? fphash : null;
        existUser.f_name = playerData.personaname;

        await existUser.save();

        await existUser.logs().create({
          ip: request.ip()
        });
        let accessToken = await auth.generate(existUser);
        return response.status(200).json({
          user: prepareUserForClient(existUser),
          token: accessToken.token
        });
      }
      const user = new User();
      user.username = playerData.steamid;
      user.email = `${playerData.steamid}@stepx.com`;
      user.password = chance.string({ length: 16 });
      user.avatar = playerData.avatarmedium;
      user.steam = playerData.steamid;
      user.f_name = playerData.personaname;
      user.money = 0;
      user.referal_code = chance.string({
        length: 14,
        pool: "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
      });
      user.fingerprint = fphash && fphash !== 'null' ? fphash : null;

      const userSameFingerprint = await User.findBy("fingerprint", fphash);
      if (userSameFingerprint && fphash !== 'null') {
        referedBy = null;
      }

      if (referedBy !== null) {
        try {
          user.refered_by = (await User.findBy("referal_code", referedBy)).id;
        } catch (err) {
          Logger.error(err.message, err);
        }
      }

      await user.save();
      await user.logs().create({
        ip: request.ip()
      });

      let accessToken = await auth.generate(user);
      return response.json({
        user: prepareUserForClient(user),
        token: accessToken.token
      });
    } catch (err) {
      response.status(500).json({
        type: "error",
        message: err.message
      });
      Logger.error(err.message, err);
    }
  }

  async remember({ request, response }) {
    try {
      const chance = new Chance();
      const { email } = request.all();
      if (!email) throw new Error("Введите Email");
      const user = await User.findBy("email", email);
      if (!user)
        throw new Error(
          `Пользователь c данной почтой не зарегистрирован в системе`
        );
      const newPassword = chance.string({
        length: 12,
        pool: "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
      });
      user.password = newPassword;
      await user.save();

      await Mail.send("emails.remember", { password: newPassword }, message => {
        message
          .to(user.email)
          .from("stepx100.fun@gmail.com")
          .subject("Восстановление пароля");
      });

      response.status(200).json({
        message:
          "Новый пароль сгенерирован <br/> и выслан на указанную вами почту"
      });
    } catch (err) {
      response.status(500).json({
        message: err.message
      });
      Logger.error(err.message, err);
    }
  }
}

module.exports = AuthController;
