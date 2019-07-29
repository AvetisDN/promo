"use strict";

/** @type {import('@adonisjs/framework/src/Hash')} */
const Hash = use("Hash");

/** @type {typeof import('@adonisjs/lucid/src/Lucid/Model')} */
const Model = use("Model");

class User extends Model {
  static boot() {
    super.boot();

    /**
     * A hook to hash the user password before saving
     * it to the database.
     */
    this.addHook("beforeSave", async userInstance => {
      if (userInstance.dirty.password) {
        userInstance.password = await Hash.make(userInstance.password);
      }
    });
  }

  getAvatar(avatar) {
    let newAvatar = !/^http/.test(avatar)
      ? `${Env.get("APP_URL")}${avatar}`
      : avatar;
    let isGif = newAvatar.match(/\.(gif)$/i);
    if (isGif) newAvatar = `https://vk.com/images/camera_100.png?ava=1`;
    return newAvatar;
  }

  getUsername(username) {
    let newUsername =
      (this.vk || this.google || this.fb || this.steam) &&
      (this.f_name && this.l_name)
        ? `${this.f_name} ${this.l_name[0]}.`
        : (this.vk || this.google || this.fb || this.steam) && this.f_name
        ? this.f_name
        : username;
    return newUsername;
  }

  /**
   * A relationship on tokens is required for auth to
   * work. Since features like `refreshTokens` or
   * `rememberToken` will be saved inside the
   * tokens table.
   *
   * @method tokens
   *
   * @return {Object}
   */
  tokens() {
    return this.hasMany("App/Models/Token");
  }
  logs() {
    return this.hasMany("App/Models/UserLog");
  }
}

module.exports = User;
