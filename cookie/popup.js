// 显示状态消息
function showStatus(message, isError = false) {
  const statusElement = document.getElementById('statusMessage');
  statusElement.textContent = message;
  statusElement.className = `status ${isError ? 'error' : 'success'}`;
  statusElement.classList.remove('hidden');
  
  // 3秒后自动隐藏
  setTimeout(() => {
    statusElement.classList.add('hidden');
  }, 3000);
}

// 获取当前活动标签页
function getCurrentTab() {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      resolve(tabs[0]);
    });
  });
}

// 获取指定域名的Cookie
function getCookiesForDomain(domain) {
  return new Promise((resolve) => {
    chrome.cookies.getAll({ domain: domain }, (cookies) => {
      resolve(cookies);
    });
  });
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

// 预览推送数据
async function previewPushData() {
  const targetDomainInput = document.getElementById('targetDomain').value.trim();
  const pushUrl = document.getElementById('pushUrl').value.trim();
  
  if (!targetDomainInput) {
    showStatus('请先配置检测域名', true);
    return;
  }

  // 格式化域名
  const targetDomain = formatDomain(targetDomainInput);
  
  if (!targetDomain) {
    showStatus('域名格式不正确', true);
    return;
  }

  try {
    // 获取当前标签页
    const currentTab = await getCurrentTab();
    
    // 获取域名的Cookie - 尝试多种方式
    const cookiesMain = await getCookiesForDomain(targetDomain);
    const cookiesWithDot = await getCookiesForDomain('.' + targetDomain);
    
    // 合并并去重Cookie
    const allCookies = [...cookiesMain, ...cookiesWithDot];
    const uniqueCookies = allCookies.filter((cookie, index, self) => 
      index === self.findIndex(c => c.name === cookie.name && c.domain === cookie.domain)
    );
    
    // 构建要发送的数据
    const dataToSend = {
      domain: targetDomain,
      cookies: {
        cookies: uniqueCookies,
        url: currentTab ? currentTab.url : '当前无活动标签页'
      },
      timestamp: new Date().toISOString(),
      pushUrl: pushUrl || '未配置推送地址'
    };

    // 显示预览数据
    const previewArea = document.getElementById('previewArea');
    previewArea.textContent = JSON.stringify(dataToSend, null, 2);
    
    if (uniqueCookies.length > 0) {
      showStatus(`成功获取 ${uniqueCookies.length} 个Cookie`);
    } else {
      showStatus(`域名 ${targetDomain} 暂无Cookie数据，请确保已访问该网站并登录`, false);
    }
  } catch (error) {
    console.error('预览数据时发生错误:', error);
    showStatus('预览数据失败: ' + error.message, true);
  }
}

// 测试推送功能
async function testPush() {
  const targetDomainInput = document.getElementById('targetDomain').value.trim();
  const pushUrl = document.getElementById('pushUrl').value.trim();
  
  if (!targetDomainInput) {
    showStatus('请先配置检测域名', true);
    return;
  }
  
  if (!pushUrl) {
    showStatus('请先配置推送接口地址', true);
    return;
  }

  // 格式化域名
  const targetDomain = formatDomain(targetDomainInput);
  
  if (!targetDomain) {
    showStatus('域名格式不正确', true);
    return;
  }

  try {
    // 验证URL格式
    new URL(pushUrl);
  } catch (error) {
    showStatus('推送接口地址格式不正确', true);
    return;
  }

  try {
    // 获取当前标签页
    const currentTab = await getCurrentTab();
    
    // 获取域名的Cookie - 尝试多种方式
    const cookiesMain = await getCookiesForDomain(targetDomain);
    const cookiesWithDot = await getCookiesForDomain('.' + targetDomain);
    
    // 合并并去重Cookie
    const allCookies = [...cookiesMain, ...cookiesWithDot];
    const uniqueCookies = allCookies.filter((cookie, index, self) => 
      index === self.findIndex(c => c.name === cookie.name && c.domain === cookie.domain)
    );
    
    // 构建要发送的数据
    const dataToSend = {
      domain: targetDomain,
      cookies: {
        cookies: uniqueCookies,
        url: currentTab ? currentTab.url : '当前无活动标签页'
      }
    };

    // 发送测试请求
    const response = await fetch(pushUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Extension-Origin': 'chrome-extension-cookie-pusher'
      },
      body: JSON.stringify(dataToSend)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    const result = await response.json();
    showStatus('测试推送成功！');
    
    // 更新预览区域显示响应
    const previewArea = document.getElementById('previewArea');
    previewArea.textContent = `测试推送成功！\n\n发送的数据:\n${JSON.stringify(dataToSend, null, 2)}\n\n服务器响应:\n${JSON.stringify(result, null, 2)}`;
    
  } catch (error) {
    console.error('测试推送时发生错误:', error);
    showStatus('测试推送失败: ' + error.message, true);
  }
}

// 页面加载时读取已保存的配置
document.addEventListener('DOMContentLoaded', () => {
  // 读取已保存的配置
  chrome.storage.sync.get(['pushUrl', 'targetDomain'], (result) => {
    document.getElementById('pushUrl').value = result.pushUrl || '';
    document.getElementById('targetDomain').value = result.targetDomain || 'mp.weixin.qq.com';
  });

  // 保存配置按钮事件
  document.getElementById('saveConfig').addEventListener('click', () => {
    const pushUrl = document.getElementById('pushUrl').value.trim();
    const targetDomainInput = document.getElementById('targetDomain').value.trim();

    // 验证输入
    if (!targetDomainInput) {
      showStatus('请输入检测域名', true);
      return;
    }

    // 格式化域名
    const targetDomain = formatDomain(targetDomainInput);
    
    if (!targetDomain) {
      showStatus('域名格式不正确', true);
      return;
    }

    if (pushUrl) {
      // 如果填写了推送地址，验证URL格式
      try {
        new URL(pushUrl);
      } catch (error) {
        showStatus('推送接口地址格式不正确', true);
        return;
      }
    }

    // 保存配置到Chrome存储
    chrome.storage.sync.set({
      pushUrl: pushUrl,
      targetDomain: targetDomain
    }, () => {
      showStatus('配置保存成功！');
      // 更新输入框显示格式化后的域名
      document.getElementById('targetDomain').value = targetDomain;
    });
  });

  // 预览数据按钮事件
  document.getElementById('previewData').addEventListener('click', previewPushData);

  // 测试推送按钮事件
  document.getElementById('testPush').addEventListener('click', testPush);
}); 