import {ApiError} from './ApiError.js';
export function governanceError(message){
  const status=/Unauthorized/i.test(message)?401:/not found/i.test(message)?404:/Forbidden|Separation of Duties|Disabled|Blocked|Protected/i.test(message)?403:/Expired|Tamper|Invalidation|Version|Concurrency|already/i.test(message)?409:400;
  return new ApiError(status,message);
}
