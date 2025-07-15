// 配置变量（可以在popup中动态配置）
let pushUrl = '';
let targetDomain = 'mp.weixin.qq.com'; // 默认域名

// 推送Cookie到指定接口
async function pushCookiesToInterface(cookies) {
  if (!pushUrl) {
    console.error('未配置推送接口地址');
    throw new Error('未配置推送接口地址');
  }

  try {
    const response = await fetch(pushUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Extension-Origin': 'chrome-extension-cookie-pusher'
      },
      body: JSON.stringify({
        domain: targetDomain,
        cookies: cookies
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('推送失败，响应状态：', response.status, errorText);
      throw new Error(`推送失败：${response.status}`);
    }

    console.log('Cookie推送成功');
    return await response.json();
  } catch (error) {
    console.error('Cookie推送详细错误:', error);
    throw error;
  }
}

// 获取当前tab的url
function getCurrentTabUrl() {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      resolve(tabs[0].url);
    });
  });
}

// 获取指定域名的所有Cookie
function getCookiesForDomain(domain) {
  return new Promise((resolve) => {
    chrome.cookies.getAll({ domain: domain }, (cookies) => {
      resolve(cookies);
    });
  });
}

// 获取域名的所有Cookie（包括子域名）
async function getAllCookiesForDomain(domain) {
  try {
    // 获取主域名和带点前缀的域名Cookie
    const cookiesMain = await getCookiesForDomain(domain);
    const cookiesWithDot = await getCookiesForDomain('.' + domain);
    
    // 合并并去重Cookie
    const allCookies = [...cookiesMain, ...cookiesWithDot];
    const uniqueCookies = allCookies.filter((cookie, index, self) => 
      index === self.findIndex(c => c.name === cookie.name && c.domain === cookie.domain)
    );
    
    return uniqueCookies;
  } catch (error) {
    console.error('获取Cookie时发生错误:', error);
    return [];
  }
}

// 格式化域名，移除协议、www前缀和路径
function formatDomain(domain) {
  if (!domain) return '';
  
  // 移除协议
  let cleanDomain = domain.replace(/^https?:\/\//, '');
  
  // 移除路径和查询参数
  cleanDomain = cleanDomain.split('/')[0].split('?')[0];
  
  // 移除端口号
  cleanDomain = cleanDomain.split(':')[0];
  
  return cleanDomain;
}

// 检查URL是否匹配目标域名
function isTargetDomain(url, targetDomain) {
  try {
    const urlObj = new URL(url);
    const cleanTargetDomain = formatDomain(targetDomain);
    
    // 支持精确匹配和子域名匹配
    return urlObj.hostname === cleanTargetDomain || urlObj.hostname.endsWith('.' + cleanTargetDomain);
  } catch (error) {
    console.error('URL解析错误:', error);
    return false;
  }
}

// 监听Tab更新事件
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url && targetDomain && pushUrl) {
    // 检查是否匹配目标域名
    if (isTargetDomain(tab.url, targetDomain)) {
      try {
        console.log(`检测到目标域名 ${targetDomain}，开始获取Cookie...`);
        const cookies = await getAllCookiesForDomain(targetDomain);
        
        // 将当前页面url一并发送
        await pushCookiesToInterface({
          cookies: cookies,
          url: tab.url,
          timestamp: new Date().toISOString()
        });
        
        console.log(`成功推送 ${cookies.length} 个Cookie到接口`);
      } catch (error) {
        console.error('Cookie推送过程中发生错误：', error);
      }
    }
  }
});

// 监听存储变化，更新配置
chrome.storage.onChanged.addListener((changes) => {
  if (changes.pushUrl) {
    pushUrl = changes.pushUrl.newValue || '';
    console.log('推送URL已更新:', pushUrl);
  }
  
  if (changes.targetDomain) {
    const newDomain = changes.targetDomain.newValue || 'mp.weixin.qq.com';
    targetDomain = formatDomain(newDomain);
    console.log('目标域名已更新:', targetDomain);
  }
});

// 初始化时读取存储的配置
chrome.storage.sync.get(['pushUrl', 'targetDomain'], (result) => {
  pushUrl = result.pushUrl || '';
  targetDomain = formatDomain(result.targetDomain || 'mp.weixin.qq.com');
  
  console.log('插件已初始化:');
  console.log('- 推送URL:', pushUrl || '未配置');
  console.log('- 目标域名:', targetDomain);
});

// 处理来自popup的消息（可用于手动触发推送等）
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'manualPush') {
    // 手动推送功能
    (async () => {
      try {
        const cookies = await getAllCookiesForDomain(targetDomain);
        const currentUrl = await getCurrentTabUrl();
        
        const result = await pushCookiesToInterface({
          cookies: cookies,
          url: currentUrl,
          timestamp: new Date().toISOString(),
          manual: true
        });
        
        sendResponse({ success: true, result: result });
      } catch (error) {
        sendResponse({ success: false, error: error.message });
      }
    })();
    
    return true; // 保持消息通道开启以进行异步响应
  }
}); 