const firebase = require('firebase-admin');
const Telegraf = require('telegraf');

const {Markup} = Telegraf;
const secrets = require(process.env.SECRET_FILE || './secrets.json');

const app = new Telegraf(secrets.telegram);

firebase.initializeApp({
  credential: firebase.credential.cert(secrets.firebase),
  databaseURL: 'https://piter-united-8b948.firebaseio.com',
});

let data = [];
let community = [];
let users = {};

const usersRef = firebase.database().ref('users');

usersRef.on('value', (snapshot) => {
  users = snapshot.val() || {};
});

app.use((res, next) => {
  const user = res.from;
  if (!users[user.id]) {
    firebase.database().ref(`users/${user.id}`).set(user);
    res.user = user;
  } else {
    res.user = users[user.id];
  }
  next();
});

firebase.database().ref(`${secrets.table}/data`)
  .on('value', (snapshot) => {
    data = snapshot.val().filter(v => v);
    community = data.map(v => v.community);
  });

const mainReply = Markup.inlineKeyboard([
  [Markup.callbackButton('Сообщества', 'community')],
  [Markup.callbackButton('Схема размещения сообществ', 'schema')],
]).resize().extra();


function start(user, reply) {
  const name = `${user.first_name} ${user.last_name}`;
  const text = `Привет ${name}! Я бот IT Global MeetUp. Я могу поделиться с тобой программой сообществ.
А еще тут ты сможешь голосовать за доклады которые прослушал.
`;
  return reply(text, mainReply);
}

app.command('start', ({user, reply}) => start(user, reply));

app.command('help', ({reply}) => reply('Всегда рад помочь!', mainReply));
app.hears('помощь', ({reply}) => reply('Всегда рад помочь!', mainReply));
app.hears('меню', ({reply, user}) => start(user, reply));

function communityList(reply) {
  const menuItems = community.map((c, i) => [Markup.callbackButton(c, `community::${i}`)]);
  const menu = Markup.inlineKeyboard(menuItems).resize().extra();
  return reply('Сообщества', menu);
}

app.action('community', ({reply}) => communityList(reply));
app.hears('сообщества', ({reply}) => communityList(reply));
app.hears('программа', ({reply}) => communityList(reply));

app.action('schema', ({replyWithPhoto}) => replyWithPhoto('http://lorempixel.com/400/200/cats/'));
app.hears('схема размещения сообществ', ({replyWithPhoto}) => replyWithPhoto('http://lorempixel.com/400/200/cats/'));
app.hears('схема', ({replyWithPhoto}) => replyWithPhoto('http://lorempixel.com/400/200/cats/'));

function showCommunity(reply, id) {
  if (!data[id]) {
    return reply('Простите но такого сообщества у меня нет :(');
  }
  const c = data[id];
  const menuItems = [];
  c.program.forEach((s, i) => {
    menuItems.push([Markup.callbackButton(`${s.time} - ${s.speaker} - ${s.subject}`, `speaker::${id}::${i}`)]);
  });
  const menu = Markup.inlineKeyboard(menuItems).extra();
  return reply(`*${c.community}*`, menu);
}

function showSpeaker(reply, id, sid) {
  if (!data[id]) {
    return reply('Простите но такого сообщества у меня нет :(');
  }
  const c = data[id];
  if (!c.program[sid]) {
    return reply('Простите но такого доклада у меня нет :(');
  }
  const s = c.program[sid];
  const menuItems = [
    Markup.callbackButton('💩', `vote::${id}::${sid}::1`),
    Markup.callbackButton('👎', `vote::${id}::${sid}::2`),
    Markup.callbackButton('👌', `vote::${id}::${sid}::3`),
    Markup.callbackButton('👍', `vote::${id}::${sid}::4`),
    Markup.callbackButton('❤️', `vote::${id}::${sid}::5`),
  ];
  const menu = Markup.inlineKeyboard(menuItems).extra();
  return reply(`${s.time} - ${s.speaker} ${(s.company) ? `(${s.company})` : ''}${s.subject ? `*${s.subject}*\n` : ''}${s.description ? s.description : ''}
`, menu);
}

function voteForSpeaker(reply, user, id, sid, vote) {
  if (!data[id]) {
    return reply('Простите но такого сообщества у меня нет :(');
  }
  const c = data[id];
  if (!c.program[sid]) {
    return reply('Простите но такого доклада у меня нет :(');
  }
  const s = c.program[sid];

  return reply(`${s.speaker}, ${vote} ${user.first_name}`);
}

app.action(/.+/, ({replyWithMarkdown, match, user}) => {
  const [cmd, id, sid, vote] = match[0].split('::');
  if (cmd === 'community') {
    return showCommunity(replyWithMarkdown, id);
  } else if (cmd === 'speaker') {
    return showSpeaker(replyWithMarkdown, id, sid);
  } else if (cmd === 'vote') {
    return voteForSpeaker(replyWithMarkdown, user, id, sid, vote);
  }
  return replyWithMarkdown('Простите я не знаю данной команды :(');
});

app.command('ping', ({reply}) => reply('pong'));

app.startPolling();
