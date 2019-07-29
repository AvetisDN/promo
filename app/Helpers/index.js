const prepareUserForClient = user =>
  (({
    id,
    username,
    money,
    avatar,
    role_id,
    referal_code,
    online,
    banned,
    vk,
    bonus_vk,
    ban_time,
    ban_ip,
    fingerprint
  }) => {
    username =
      (user.vk || user.google || user.fb || user.steam) &&
      (user.f_name && user.l_name)
        ? `${user.f_name} ${user.l_name[0]}.`
        : (user.vk || user.google || user.fb || user.steam) && user.f_name
        ? user.f_name
        : user.username;
    return {
      id,
      username,
      money,
      avatar,
      role_id,
      referal_code,
      online,
      banned,
      vk,
      bonus_vk,
      ban_time,
      ban_ip,
      fingerprint
    };
  })(user);

module.exports = {
  prepareUserForClient
}
