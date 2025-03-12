import {
    format,
    formatDistance,
    formatDistanceToNow,
    formatRelative,
    isToday,
    isYesterday,
    isThisWeek,
    isThisMonth,
    isThisYear,
  } from 'date-fns';
  import { zhCN } from 'date-fns/locale';
  
  /**
   * 格式化日期/时间戳为友好可读的相对时间
   * @param date 日期或时间戳
   * @returns 相对时间字符串，如"3分钟前"、"昨天"等
   */
  export function formatFriendlyDate(date: Date | number): string {
    const dateObj = typeof date === 'number' ? new Date(date) : date;
    
    try {
      if (isToday(dateObj)) {
        return '今天 ' + format(dateObj, 'HH:mm');
      } else if (isYesterday(dateObj)) {
        return '昨天 ' + format(dateObj, 'HH:mm');
      } else if (isThisWeek(dateObj)) {
        return formatRelative(dateObj, new Date(), { locale: zhCN });
      } else if (isThisMonth(dateObj)) {
        return format(dateObj, 'M月d日', { locale: zhCN });
      } else if (isThisYear(dateObj)) {
        return format(dateObj, 'M月d日', { locale: zhCN });
      } else {
        return format(dateObj, 'yyyy年M月d日', { locale: zhCN });
      }
    } catch (error) {
      console.error('日期格式化错误:', error);
      return '未知时间';
    }
  }
  
  /**
   * 格式化时间为距离现在的时间
   * @param date 日期或时间戳
   * @returns 相对时间字符串，如"3分钟前"
   */
  export function formatTimeAgo(date: Date | number): string {
    const dateObj = typeof date === 'number' ? new Date(date) : date;
    
    try {
      return formatDistanceToNow(dateObj, {
        addSuffix: true,
        locale: zhCN
      });
    } catch (error) {
      console.error('时间距离格式化错误:', error);
      return '未知时间';
    }
  }
  
  /**
   * 格式化为标准日期时间格式
   * @param date 日期或时间戳
   * @returns 标准格式的日期时间字符串
   */
  export function formatDateTime(date: Date | number): string {
    const dateObj = typeof date === 'number' ? new Date(date) : date;
    
    try {
      return format(dateObj, 'yyyy-MM-dd HH:mm:ss');
    } catch (error) {
      console.error('日期时间格式化错误:', error);
      return '未知时间';
    }
  }