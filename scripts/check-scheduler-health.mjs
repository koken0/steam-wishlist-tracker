const endpoint = process.env.WISHLINE_MONITOR_URL?.trim();
const secret = process.env.WISHLINE_MONITOR_SECRET?.trim();

if (!endpoint || !secret) {
  console.error('Scheduler monitoring requires WISHLINE_MONITOR_URL and WISHLINE_MONITOR_SECRET in .env.monitor.local.');
  process.exitCode = 1;
} else {
  try {
    const response = await fetch(endpoint, {
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${secret}`,
      },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      console.error(`Scheduler health request failed with HTTP ${response.status}.`);
      process.exitCode = 1;
    } else {
      console.log(JSON.stringify(await response.json(), null, 2));
    }
  } catch {
    console.error('Scheduler health request could not reach the configured endpoint.');
    process.exitCode = 1;
  }
}
