/**
 * Stage 12 types: community observation posts, accounts, discussion and
 * questions.
 *
 * Everything exported from here is either a database row shape (used inside
 * the repositories) or a deliberately whitelisted public shape (used by the
 * API). There is no type in this file that carries a phone number, a
 * verification code, an authentication token or an internal prompt, because a
 * public serializer that cannot express a secret cannot leak one.
 */
export {};
