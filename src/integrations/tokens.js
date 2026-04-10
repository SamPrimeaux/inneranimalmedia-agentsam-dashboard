export async function getIntegrationToken(DB, userId, provider, accountId) {
  if (!DB || !userId || !provider) return null;
  const aid = accountId != null ? String(accountId) : '';
  if (provider === 'github' && aid === '') {
    const row = await DB.prepare(
      `SELECT access_token, refresh_token, expires_at FROM user_oauth_tokens WHERE user_id = ? AND provider = 'github' ORDER BY account_identifier ASC LIMIT 1`
    ).bind(userId).first();
    return row || null;
  }
  const row = await DB.prepare(
    `SELECT access_token, refresh_token, expires_at FROM user_oauth_tokens WHERE user_id = ? AND provider = ? AND account_identifier = ?`
  ).bind(userId, provider, aid).first();
  return row || null;
}
