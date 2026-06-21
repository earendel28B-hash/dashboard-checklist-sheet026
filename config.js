window.DASHBOARD_CONFIG = {
  // URL must return JSON in the same shape as data.json.
  // Replace with a Google Apps Script, Supabase, Firebase, or other API URL
  // when you need updates without waiting for a GitHub Pages deployment.
  dataUrl: "./data.json",

  // GitHub Pages is static, so the dashboard checks for updated data on a timer.
  refreshIntervalMs: 15000,
};
