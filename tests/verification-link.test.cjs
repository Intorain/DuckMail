const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { test } = require('node:test');

function load(file, modules = {}) {
  const source = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
  const js = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const context = { exports: {}, URL, console, require: (id) => modules[id] };
  vm.runInNewContext(js, context);
  return context.exports;
}

const codeModule = load('lib/verification-code.ts');
const { extractVerificationLink } = load('lib/verification-link.ts', { '@/lib/verification-code': codeModule });
const url = (mail) => extractVerificationLink(mail)?.url ?? null;

// [说明, 邮件, 期望的链接]
const positives = [
  ['按钮 + 备用网址 + 退订', {
    subject: 'Confirm your email address',
    html: '<p>Thanks for signing up! Please confirm your email address.</p><a href="https://acme.dev/confirm?token=abc&amp;u=1" style="background:#000">Confirm email address</a><p>If the button does not work, copy this link: <a href="https://acme.dev/confirm?token=abc&amp;u=1">https://acme.dev/confirm?token=abc&amp;u=1</a></p><a href="https://acme.dev/unsubscribe">Unsubscribe</a> · <a href="https://acme.dev/privacy">Privacy</a>',
  }, 'https://acme.dev/confirm?token=abc&u=1'],
  ['纯文本邮件', {
    subject: 'Verify your email',
    text: 'Click the link below to verify your email address:\nhttps://example.com/verify?token=839201&uid=123456\n\nThis link expires in 24 hours.',
  }, 'https://example.com/verify?token=839201&uid=123456'],
  ['中文按钮', {
    subject: '欢迎注册',
    html: '<p>欢迎注册！请点击下方按钮验证您的邮箱。</p><a href="https://x.cn/activate?k=1">立即验证</a><p><a href="https://x.cn/help">帮助中心</a></p>',
  }, 'https://x.cn/activate?k=1'],
  ['中文纯文本', {
    subject: '激活您的账号',
    text: '您好，请点击以下链接激活您的账号：\nhttps://foo.cn/a/9f8e7d\n如非本人操作，请忽略本邮件。',
  }, 'https://foo.cn/a/9f8e7d'],
  ['魔法链接登录', {
    subject: 'Sign in to Notion',
    html: '<p>Click the link below to sign in. This link expires in 10 minutes.</p><a href="https://www.notion.so/loginwithemail?token=t1">Sign in to Notion</a><p><a href="https://www.notion.so/help">Help</a></p>',
  }, 'https://www.notion.so/loginwithemail?token=t1'],
  ['追踪跳转链接', {
    subject: 'Please verify your account',
    html: '<p>Verify your account to get started.</p><a href="https://u123.ct.sendgrid.net/ls/click?upn=xyz">Verify Email</a>',
  }, 'https://u123.ct.sendgrid.net/ls/click?upn=xyz'],
  ['图片按钮用 alt', {
    subject: 'Welcome',
    html: '<p>Please verify your account by clicking the button below.</p><a href="https://shop.io/v/123"><img src="data:image/png;base64,AA" alt="Verify my account"></a>',
  }, 'https://shop.io/v/123'],
  ['重复按钮不同追踪参数', {
    subject: 'Confirm your email',
    html: '<p>Confirm your email to finish signing up.</p><a href="https://t.mail.io/c/1">Confirm email</a><p>...</p><a href="https://t.mail.io/c/2">Confirm email</a>',
  }, 'https://t.mail.io/c/1'],
  ['页眉登录 + 验证按钮', {
    subject: 'Verify your email address',
    html: '<a href="https://app.io/login">Log in</a><p>Please verify your email address.</p><a href="https://app.io/verify/abc">Verify email</a>',
  }, 'https://app.io/verify/abc'],
  ['日语', {
    subject: 'メールアドレスの確認',
    html: '<p>以下のボタンからメールアドレスを確認してください。</p><a href="https://jp.example/confirm/1">メールアドレスを確認する</a>',
  }, 'https://jp.example/confirm/1'],
  ['验证码邮件里附带验证按钮', {
    subject: 'Your verification code',
    html: '<p>Your verification code is 482913. Or verify your email with one click:</p><a href="https://site.com/e/verify?c=1">Verify</a>',
  }, 'https://site.com/e/verify?c=1'],
  ['click here 泛称链接', {
    subject: 'Activate your account',
    html: '<p>To activate your account, <a href="https://svc.io/activate/77">click here</a>.</p>',
  }, 'https://svc.io/activate/77'],
  ['双重确认订阅', {
    subject: 'Please confirm your subscription',
    html: '<p>Please confirm your subscription to our list.</p><a href="https://acme.us1.list-manage.com/subscribe/confirm?u=1">Yes, subscribe me to this list.</a>',
  }, 'https://acme.us1.list-manage.com/subscribe/confirm?u=1'],
];

const negatives = [
  ['发货通知里的登录按钮', {
    subject: 'Your order #112-3344556 has shipped',
    html: '<p>Your package is on the way.</p><a href="https://shop.com/track/1">Track package</a><a href="https://shop.com/login">Log in to your account</a>',
  }],
  ['新登录提醒', {
    subject: 'New sign-in to your account',
    html: '<p>We noticed a new sign-in to your account from Chrome on macOS.</p><a href="https://acct.com/security">Secure your account</a><a href="https://acct.com/activity">Review activity</a>',
  }],
  ['重置密码', {
    subject: 'Reset your password',
    html: '<p>Someone requested a password reset. Click below to choose a new password.</p><a href="https://acct.com/reset?t=1">Reset password</a>',
  }],
  ['只有验证码和页脚链接', {
    subject: 'Your verification code',
    html: '<p>Your verification code is 482913. Use it to verify your email.</p><a href="https://site.com/help">Help center</a> <a href="https://site.com/privacy">Privacy</a> <a href="https://site.com/unsubscribe">Unsubscribe</a>',
  }],
  ['两个不同的验证动作', {
    subject: 'Verify your email',
    html: '<p>Please verify your email.</p><a href="https://a.com/verify/1">Verify email</a><a href="https://b.com/confirm/2">Confirm account</a>',
  }],
  ['"不是我"链接', {
    subject: 'Confirm your email',
    text: 'Your code is 123456. Use it to confirm your email address.\nIf you didn\'t request this, click here: https://x.com/report?id=1',
  }],
  ['营销邮件的确认按钮', {
    subject: 'Confirm your seat for our webinar',
    html: '<p>Join us on Thursday!</p><a href="https://events.io/rsvp/1">Confirm my seat</a>',
  }],
  ['验证邮件里只有社交媒体链接', {
    subject: 'Verify your email',
    html: '<p>Your code: 552013. Enter it to verify your email.</p><a href="https://twitter.com/acme">Twitter</a><a href="https://www.facebook.com/acme">Facebook</a>',
  }],
  ['退订确认', {
    subject: 'Confirm your subscription preferences',
    html: '<p>Confirm your subscription preferences.</p><a href="https://news.io/unsubscribe?u=1">确认退订</a>',
  }],
  ['链接前没有动作说明', {
    subject: 'Verify your email',
    text: 'Your verification code is 839201.\n\nAcme Inc.\nhttps://acme.dev',
  }],
  ['mailto 链接', {
    subject: 'Verify your email',
    html: '<p>Please verify your email.</p><a href="mailto:support@acme.dev">Verify email</a>',
  }],
];

test('识别常见验证链接', () => {
  const failures = positives.map(([name, mail, expected]) => [name, url(mail), expected]).filter(([, actual, expected]) => actual !== expected);
  assert.deepEqual(failures, []);
});

test('不误判非验证链接', () => {
  const failures = negatives.map(([name, mail]) => [name, url(mail)]).filter(([, actual]) => actual !== null);
  assert.deepEqual(failures, []);
});

test('返回去掉 www 的域名', () => {
  assert.equal(extractVerificationLink(positives[4][1])?.host, 'notion.so');
});

test('恶意长文本不会拖慢识别', () => {
  const hostile = [
    { subject: 'Verify your email', html: '<a '.repeat(66000) },
    { subject: 'Verify your email', html: '<a href="https://x.com">'.repeat(8000) },
    { subject: 'Verify your email', text: 'click https://'.repeat(15000) },
    { subject: 'verify your email ' + 'a'.repeat(200000) },
  ];
  for (const mail of hostile) {
    const started = Date.now();
    extractVerificationLink(mail);
    assert.ok(Date.now() - started < 800, `slow on ${JSON.stringify((mail.html || mail.text || mail.subject).slice(0, 30))}`);
  }
});
