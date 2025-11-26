/**
 * Utility to convert BigInt values to strings for JSON serialization
 */

export const convertBigIntToString = (obj: any): any => {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (typeof obj === 'bigint') {
    return obj.toString();
  }

  if (obj instanceof Date) {
    return obj.toISOString();
  }

  if (Array.isArray(obj)) {
    return obj.map(item => convertBigIntToString(item));
  }

  if (typeof obj === 'object') {
    const converted: any = {};
    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === 'bigint') {
        converted[key] = value.toString();
      } else if (value instanceof Date) {
        converted[key] = value.toISOString();
      } else if (Array.isArray(value)) {
        converted[key] = value.map(item => convertBigIntToString(item));
      } else if (typeof value === 'object' && value !== null) {
        converted[key] = convertBigIntToString(value);
      } else {
        converted[key] = value;
      }
    }
    return converted;
  }

  return obj;
};

/**
 * Middleware to automatically convert BigInt values in responses
 */
export const bigIntMiddleware = (req: any, res: any, next: any) => {
  const originalJson = res.json;
  res.json = function(data: any) {
    const converted = convertBigIntToString(data);
    return originalJson.call(this, converted);
  };
  next();
};
