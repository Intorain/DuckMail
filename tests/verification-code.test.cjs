const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { test } = require('node:test');

const source = fs.readFileSync(path.join(__dirname, '../lib/verification-code.ts'), 'utf8');
const js = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;
const context = { exports: {} };
vm.runInNewContext(js, context);
const { extractVerificationCode } = context.exports;

// [说明, 输入, 期望]
const positives = [
  ['英文主题', { subject: 'Your verification code is 482913' }, '482913'],
  ['倒装主题', { subject: '482913 is your Instagram code' }, '482913'],
  ['ChatGPT 主题', { subject: 'Your ChatGPT code is 039281' }, '039281'],
  ['中文主题带签名', { subject: '【腾讯云】验证码：739201' }, '739201'],
  ['中文正文', { subject: '注册验证', text: '您的验证码为 528341，5分钟内有效，请勿泄露给他人。' }, '528341'],
  ['中文倒装', { subject: '登录提醒', text: '108833 是您本次登录的验证码，10 分钟内有效。' }, '108833'],
  ['全角数字', { subject: '验证码通知', text: '您的验证码：１２３４５６' }, '123456'],
  ['字母数字混合', { subject: 'Sign in', text: 'Your one-time passcode: 7G4K2P' }, '7G4K2P'],
  ['分组数字', { subject: 'Security alert', text: 'Use security code 123-456 to sign in.' }, '123456'],
  ['空格分组', { subject: 'Microsoft account', text: 'Security code: 384 291' }, '384291'],
  ['8 位数字', { subject: '[GitHub] Please verify your device', text: 'Verification code: 51208736\n\nIf you did not attempt to sign in, change your password.' }, '51208736'],
  ['单独成行', { subject: 'Verify your email', text: 'Enter the verification code below to finish signing up:\n\n839201\n\nThis code expires in 10 minutes.' }, '839201'],
  ['HTML 大字号', {
    subject: 'Confirm your email address',
    html: '<html><head><style>.code{color:#333333;font-size:32px}</style></head><body><p>Hi,</p><p>Please use the following code to complete your sign-in. It is valid for 15 minutes.</p><table><tr><td class="code" style="font-size:32px;letter-spacing:4px">472 819</td></tr></table><p>© 2026 Acme Inc.</p></body></html>',
  }, '472819'],
  ['HTML 实体', { subject: '验证码', html: '<div>您的验证码是&nbsp;<b>660134</b>&nbsp;。</div>' }, '660134'],
  ['Steam 风格', { subject: 'Your Steam account: Access from new computer', text: "Here is the Steam Guard code you need to login to account foo:\n\nF7K2Q\n\nThis email was generated because of a login attempt." }, 'F7K2Q'],
  ['日语', { subject: 'ログイン', text: '認証コード: 902341' }, '902341'],
  ['韩语', { subject: '로그인', text: '인증번호 [552013]를 입력해주세요.' }, '552013'],
  ['西语', { subject: 'Inicio de sesión', text: 'Tu código de verificación es 773421' }, '773421'],
  ['有效期在前', { subject: 'Login', text: 'Your login code (valid for 10 minutes): 664201' }, '664201'],
  ['Slack 风格分组', { subject: 'Slack confirmation code: Q7S-8KJ', text: '' }, 'Q7S8KJ'],
];

const negatives = [
  ['订单号', { subject: 'Your order #123456 has shipped', text: 'Order number: 123456. Track your package.' }],
  ['金额日期', { subject: 'Receipt', text: 'Order confirmation 2024-05-12, total $123.45. Thanks for your purchase.' }],
  ['客服电话', { subject: '欢迎注册', text: '如有疑问请致电 400-123-4567 或 95555。' }],
  ['发票号', { subject: 'Invoice 20240512', text: 'Your invoice 20240512 is attached.' }],
  ['优惠码', { subject: 'Welcome! Get 20% off', text: 'Use promo code SAVE2024 at checkout. Coupon code: WELCOME10' }],
  ['链接验证', { subject: 'Verify your email', text: 'Click the link to verify your email: https://example.com/verify?token=839201&uid=123456' }],
  ['只有验证码字样', { subject: '验证码将在 5 分钟后失效', text: '请勿将验证码告诉任何人。客服电话 95555。' }],
  ['邮编', { subject: 'Shipping address', text: 'Zip code: 94107' }],
  ['卡号尾号', { subject: 'Payment received', text: 'Card ending in 4242 was charged ¥1999.' }],
  ['年份版权', { subject: 'Newsletter', text: 'Read our latest news.\n\n2026\n\n© 2026 Example Inc.' }],
  ['错误码', { subject: 'Build failed', text: 'Error code: 500123. Please retry.' }],
  ['有效期分钟', { subject: 'Your verification code', text: 'Your verification code expires in 10mins.' }],
  ['验证码在下一句的订单号前', { subject: 'Verification', text: 'We sent you a verification code. Your order 88213409 is confirmed.' }],
  ['账号 ID', { subject: '账户通知', text: '您的账号 ID: 10023456 已完成实名认证。' }],
  ['CSS 颜色', { subject: 'Security code', html: '<div style="color:#AB12CD">Your account was updated.</div>' }],
  ['跟踪号', { subject: 'Shipment', text: 'Tracking number 1Z999AA10123456784' }],
];

// 一次列出全部不符合的样本，方便对照调整规则
test('识别常见验证码', () => {
  const failures = positives
    .map(([name, input, expected]) => [name, extractVerificationCode(input), expected])
    .filter(([, actual, expected]) => actual !== expected);
  assert.deepEqual(failures, []);
});

test('不误判非验证码数字', () => {
  const failures = negatives
    .map(([name, input]) => [name, extractVerificationCode(input)])
    .filter(([, actual]) => actual !== null);
  assert.deepEqual(failures, []);
});

// 开源项目（2FHey、AOSP、cloudflare_temp_email 等）测试集里的真实样本：[正文, 期望, 选项]
const corpus = [
  // ---- cloudflare_temp_email 正例 ----
  ['您的验证码是 123456，5分钟内有效', '123456'],
  ['【某某】验证码：839201，请勿泄露', '839201'],
  ['验证码123456，10分钟内有效', '123456'],
  ['您的登录动态码为 4821', '4821'],
  ['123456 是您的验证码，请勿转发', '123456'],
  ['驗證碼：556677', '556677'],
  ['【必胜客】116352（动态验证码），请在30分钟内填写', '116352'],
  ['【APPLE】Apple ID代码为：724818。请勿与他人共享。', '724818'],
  ['【某视频】654321短信登录验证码，5分钟内有效', '654321'],
  ['校验码：１２３４５６，请勿告诉他人', '123456'],
  ['您的动态口令为 918273', '918273'],
  ['支付宝校验码 4096，付款金额 169.00 元', '4096'],
  ['認証コードは 482913 です。', '482913'],
  ['ワンタイムパスコード「736251」を入力してください', '736251'],
  ['인증번호 [736251]를 입력해 주세요.', '736251'],
  ['Ваш код: 123456', '123456'],
  ['Su código de verificación es 482913', '482913'],
  ['PayPal : 551234 est votre code de sécurité', '551234'],
  ['Ihr Bestätigungscode ist: AB3C45', 'AB3C45'],
  ['קוד האימות שלך הוא 123456', '123456'],
  ['Your verification code is: 482913', '482913'],
  ['123456 is your Instagram code', '123456'],
  ['G-482913 is your Google verification code', '482913'],
  ['ABC123 is your verification code', 'ABC123'],
  ['Your code: 123-456', '123456'],
  ['Your security verification code is: 7​4‌9‍1﻿8⁠3. Use it to complete sign-in.', '749183'],
  ['Here is your one-time verification passcode: K9X-4B2. Valid for 10 minutes.', 'K9X4B2'],
  ['Your code is\n\n  839201\n\nIt expires in 10 minutes', '839201'],
  ['Enter this code to sign in\n 591 204\n', '591204'],
  ['Please enter the code below:\nAB12CD\n', 'AB12CD'],
  ['Order #20391 shipped. Call 400-820-1234. Your login code: 7F3K9Q', '7F3K9Q'],
  ['Please verify your email.\n\n706215\n\nThanks', '706215'],
  ['Email verification\n\n582013\n\nThis code expires soon.', '582013'],
  ['请验证您的邮箱\n\n662817\n', '662817'],
  ['Hello,\n\nUse the following code to log in:\n\n  274019\n\nIf you did not request this, ignore.', '274019'],
  ['Your Microsoft account security code\nSecurity code: 3721\nAccount: a***@x.com', '3721'],
  ['Here is your GitHub launch code: 12345678\n\n© 2026 GitHub, Inc. San Francisco, CA 94107', '12345678'],
  ['Your PIN is 4821', '4821'],
  ['Your OTP for payment of Rs 5000 is 482913', '482913'],
  ['OTP for txn of Rs 5000.00 is 482913', '482913'],
  ['Your verification code for order 99887766 is 123456', '123456'],
  ['Login code: 12345. Do not give this code to anyone', '12345'],
  ['Your code for mark.kennedy.5561@example.com is 902113', '902113'],
  ['123456 is OTP for your fund transfer, valid for 5 mins.', '123456'],
  ['123456 ist dein Amazon-Einmalkennwort. Teile es nicht mit anderen Personen.', '123456'],
  ['Il tuo codice di sicurezza è: 123456', '123456'],
  ['Le code à saisir pour votre achat de 200,00 EUR est 12345678.', '12345678'],
  ['[Binance TR] Doğrulama Kodu: 123456. Lütfen paylaşmayın', '123456'],
  // ---- 2FHey 正例 ----
  ["Your Apple ID Code is: 654321. Don't share it with anyone.", '654321'],
  ['Your portal verification code is : jh7112 Msg&Data rates may apply.', 'jh7112'],
  ['GEICO: Your verification code is: 0ACE2A. It expires in 10 minutes.', '0ACE2A'],
  ['GEICO: Your verification code is: 052045. It expires in 10 minutes. Please do not reply to this message.', '052045'],
  ['Truist Alerts: To verify the JAILATM CO transaction on card 0323, use 582270. We won\'t contact you for this code.', '582270'],
  ['From: Chase\nWe\'ll NEVER call you to ask for this code.\nOne-Time Code:12345678\nOnly use this online.', '12345678'],
  ['You are making an online PURCHASE with your TD card ending 4888. Be aware of scams - TD will NEVER call you for this code. Your PURCHASE code is 916955.', '916955'],
  ['New login from +1 (415) 555-2671. Your code is 887766.', '887766'],
  ['Your verification code is 123456. Call us at 555-123-4567 if this wasn\'t you.', '123456'],
  ['Your code is 445566. Questions? Text 787473.', '445566'],
  ['Your code is 246813. Details: https://example.com/verify/999999', '246813'],
  ['Your Tinder code is 281700 @tinder.com #281700', '281700'],
  ['385398 is your Wealthfront verification code. This code expires in 3 minutes.\n@wealthfront.com #385398', '385398'],
  ['【京东】验证码：548393，您正在新设备上登录。', '548393'],
  ['【网之易】您的验证码为962975。如非本人操作，请注意账号安全，防止被盗。', '962975'],
  ['【哔哩哔哩】778604为本次登录验证的手机验证码，请在5分钟内完成验证。', '778604'],
  ['【芒果tv】740238（随机验证码），有效期10分钟。', '740238'],
  ['Your verification code is 123 456', '123456'],
  // ---- 仅主题 / HTML ----
  ['Hi, thanks for signing up.', '482913', { subject: '482913 is your Acme verification code' }],
  ['<html><head><style>.x{color:#999999} td{padding:123456px}</style></head><body><p>Your verification code</p><table><tr><td style="font-size:32px"><b>731904</b></td></tr></table><p>© 2026 Acme, 94107</p></body></html>', '731904', { subject: 'Verify your email', html: true }],
  ['<div>Confirm your email address</div><div style="color:#ff5733">Use code</div><h1>A7K2Q9</h1>', 'A7K2Q9', { html: true }],

  // ---- cloudflare_temp_email 反例 ----
  ['Hi, invoice total 3500 yuan, see attachment', null],
  ['Your order #582910 has shipped', null],
  ['Meeting moved to 2026-09-18 15:30, room 1203', null],
  ['Use promo code: SAVE2026 at checkout', null],
  ['Sign in to see your order, total $1299.00', null],
  ['verification code is: Your account', null],
  ['Your verification code is 2026', null],
  ['Security notice for account created on 20260411', null],
  ['Please verify your email by clicking the link below.\n© 2026 GitHub, Inc. San Francisco, CA 94107', null],
  ['Confirm your subscription. Reply STOP to 10086', null],
  ['Sign in attempt from 192.168.1.1 at 12:30. Ref 88213', null],
  ['登录提醒：您的账号于 2026年9月17日 在北京登录，如非本人操作请致电 95588', null],
  ['code: 4155552671', null],
  ['Your verification code is 1234.56', null],
  ['Your verification code is EXPIRED', null],
  ['Do not share this code. Code: NEVER', null],
  ['Tracking code: 58291034', null],
  ['Order code: 582910', null],
  ['Reference code: 48291', null],
  ['Voucher code: 123456', null],
  ['Sign in to your account\n\n90210\n', null],
  ['Please verify. Account ID:\n884211\n', null],
  ['Order confirmation\n123456', null],
  ['706215\n\nThanks for your order', null],
  ['Please verify your email. Account ID:\n\n884211\n', null],
  ['Order confirmation\n\nOrder number\n582910\n', null],
  ['Your payment is confirmed.\n\n482910\n', null],
  ['Booking confirmed\n\n77120\n\nSee you soon', null],
  ['Verify your email: https://example.com/verify?token=123456&id=998877', null],
  ['Your footprint report for 2026: 58291 steps', null],
  ['Welcome to our service. Enjoy a 30% discount with code SUMMER2026!', null],
  ['We sent a code to your phone number ending 5678', null],
  // ---- 2FHey 反例（来自其 issue）----
  ['Call us to verify your account at 555-123-4567.', null],
  ['Your verification call will come from +1 415 555 2671.', null],
  ['To verify, text HELP to 466453.', null],
  ['Your verification code request was received. Ref 4155552671123.', null],
  ['Your payment of 1234.56 was confirmed at 10:30 on 12/25/2025.', null],
  ['Verify at https://example.com/session/12345678', null],
  ['Hey, meet me at 123456 Main St', null],
  ['His authoritarian agenda is a threat. We won in 2024 and can win again. Give $15 today.', null],
  ['Will you chip in $15 to our campaign? i.example.com/ppiNg4AP\n\nStop2End', null],
  ['Please verify your account at example.com/account. Reply Stop2End to opt out', null],
  ['Qr code is officially in the works and will be ready in a couple of weeks.', null],
  ['Hi David, Appt reminder:\nFri Apr 5, 9:00 AM\nPlease call us at (608)833-1100 if you have any questions.', null],
  ['USAA FRAUD PREVENTION ALERT: USAA will never contact you for this code, don\'t share it: ######. Call 800-531-8722 if you gave it to anyone.', null],
  // ---- AOSP 反例 ----
  ['This is a false positive 4543', null],
  ['34343 is a number. This number is a code', null],
  ['context word: code. One sentence. actual value 34343', null],
  // ---- 临时邮箱场景反例 ----
  ['您的订单号 20261013887 已发货，快递单号 SF1234567890，客服电话 400-820-1234', null],
  ['您尾号1234的卡于10月13日消费 ¥128.00', null],
  ['订单 582910 已确认，邮编 100086', null],
  ['Invoice INV-58291 for $49.00 is attached. Your account code is ready.', null],
  ['<style>a{color:#A1B2C3}</style><p>Your invitation code: see the app. Color: #FF5733</p>', null, { html: true }],
  ['Your invite code: X7K2PQ — share it with friends', null],
  ['邀请码：A8K29Q，注册即送优惠', null],
  ['Your booking confirmation code: X7K2PQ', null],
  ['Your verification code is 482913 and your backup code is 771204', null],
  // ---- 截断的列表摘要 ----
  ['Your verification code is 1234', null, { intro: true }],
  ['Your verification code is 123456. It expires in 10', '123456', { intro: true }],
];

test('开源项目真实样本', () => {
  const failures = corpus
    .map(([body, expected, o = {}]) => {
      const mail = o.html ? { subject: o.subject, html: body } : o.intro ? { subject: o.subject, intro: body } : { subject: o.subject, text: body };
      return [body.slice(0, 60), extractVerificationCode(mail, { introOnly: !!o.intro }), expected];
    })
    .filter(([, actual, expected]) => actual !== expected);
  assert.deepEqual(failures, []);
});

// 构造会让正则回溯爆炸的输入，确认不会卡住页面
test('恶意长文本不会拖慢识别', () => {
  const hostile = [' '.repeat(200000) + 'x', ('code' + ' '.repeat(1000)).repeat(200), '1'.repeat(200000), '验证码的的的的的的'.repeat(20000), 'code: ' + 'abc-'.repeat(50000)];
  for (const text of hostile) {
    const started = Date.now();
    extractVerificationCode({ text });
    assert.ok(Date.now() - started < 500, `slow on ${JSON.stringify(text.slice(0, 20))}`);
  }
});
