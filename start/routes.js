'use strict'

/*
|--------------------------------------------------------------------------
| Routes
|--------------------------------------------------------------------------
|
| Http routes are entry points to your web application. You can create
| routes for different URL's and bind Controller actions to them.
|
| A complete guide on routing is available here.
| http://adonisjs.com/docs/4.1/routing
|
*/

/** @type {typeof import('@adonisjs/framework/src/Route/Manager')} */
const Route = use('Route')

Route.post("/user-promo", "UserPromoController.create");

Route.post("/auth/register", "AuthController.register");
Route.post("/auth/login", "AuthController.login");
Route.get("/auth/validate", "AuthController.validate");
Route.get("/auth/vk", "AuthController.vk");
Route.post("/auth/google", "AuthController.google");
Route.post("/auth/facebook", "AuthController.facebook");
Route.post("/auth/steam", "AuthController.steam");
Route.post("/auth/remember", "AuthController.remember");
Route.post("/auth/verify", "AuthController.verifyEmail");
