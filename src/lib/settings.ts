import type { Env, AppSettings } from '../types';

// Get all app settings
export async function getAppSettings(env: Env): Promise<AppSettings> {
  const result = await env.DB.prepare(
    'SELECT key, value FROM app_settings'
  ).all<{ key: string; value: string }>();

  const settings: Record<string, string> = {};
  for (const row of result.results || []) {
    settings[row.key] = row.value;
  }

  return {
    enable_image_generation: settings.enable_image_generation === 'true',
    enable_deep_thinking: settings.enable_deep_thinking === 'true',
    model_temperature: parseFloat(settings.model_temperature || '0.7'),
    max_tokens: parseInt(settings.max_tokens || '4096', 10),
    rate_limit_per_day: parseInt(settings.rate_limit_per_day || '100', 10),
  };
}

// Update a single setting
export async function updateAppSetting(
  env: Env,
  key: keyof AppSettings,
  value: string | number | boolean
): Promise<void> {
  const stringValue = String(value);
  await env.DB.prepare(
    'UPDATE app_settings SET value = ?, updated_at = ? WHERE key = ?'
  ).bind(stringValue, Math.floor(Date.now() / 1000), key).run();
}

// Update multiple settings
export async function updateAppSettings(
  env: Env,
  updates: Partial<AppSettings>
): Promise<void> {
  const batch = [];
  const now = Math.floor(Date.now() / 1000);

  for (const [key, value] of Object.entries(updates)) {
    if (value !== undefined) {
      batch.push(
        env.DB.prepare(
          'UPDATE app_settings SET value = ?, updated_at = ? WHERE key = ?'
        ).bind(String(value), now, key)
      );
    }
  }

  if (batch.length > 0) {
    await env.DB.batch(batch);
  }
}

// Get a single setting
export async function getAppSetting<K extends keyof AppSettings>(
  env: Env,
  key: K
): Promise<AppSettings[K]> {
  const result = await env.DB.prepare(
    'SELECT value FROM app_settings WHERE key = ?'
  ).bind(key).first<{ value: string }>();

  if (!result) {
    // Return defaults
    const defaults: AppSettings = {
      enable_image_generation: true,
      enable_deep_thinking: true,
      model_temperature: 0.7,
      max_tokens: 4096,
      rate_limit_per_day: 100,
    };
    return defaults[key];
  }

  // Parse based on key type
  if (key === 'enable_image_generation' || key === 'enable_deep_thinking') {
    return (result.value === 'true') as AppSettings[K];
  }
  if (key === 'model_temperature') {
    return parseFloat(result.value) as AppSettings[K];
  }
  if (key === 'max_tokens' || key === 'rate_limit_per_day') {
    return parseInt(result.value, 10) as AppSettings[K];
  }

  return result.value as AppSettings[K];
}
