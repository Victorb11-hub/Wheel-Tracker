// Pin all date-sensitive tests to America/New_York. This is where the trader
// operates; v1's date bugs were specific to that zone (Sunday boundary, DST).
process.env.TZ = 'America/New_York';
