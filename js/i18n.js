'use strict';

const LANGS = {
  ru: {
    title:           'Поиск на реке Сунжа',
    searching:       'ПОИСК ИДЁТ',
    vol_label1:      'волонтёров',
    vol_label2:      'на реке',
    pts_label1:      'точек',
    pts_label2:      'прочёсывается',
    zoom_hint:       'Приблизьте карту (зум ≥ 15) чтобы увидеть точки',
    leg_free:        'Свободно',
    leg_busy:        'Занято',
    leg_mine:        'Моя точка',
    leave_btn:       'Уйти',
    my_id:           'Мой ID:',
    badge_free:      '● СВОБОДНА',
    badge_partial:   '● НА ТОЧКЕ',
    badge_full:      '● ЗАПОЛНЕНА',
    btn_claim:       'Встать на эту точку',
    btn_leave:       'Уйти с этой точки',
    btn_close:       'Закрыть',
    you:             '(вы)',
    since:           'с',
    point:           'Точка',
    already_on:      n => `Вы уже стоите на Точке #${n}. Сначала уйдите оттуда.`,
    full_note:       n => `Точка заполнена — все ${n} мест заняты.`,
    t_freed:         'Точка освобождена',
    t_auto_freed:    'Ваша точка была освобождена автоматически',
    t_first_leave:   'Сначала уйдите с вашей текущей точки',
    t_just_full:     'Точка только что заполнилась! Выберите другую.',
    t_error:         'Ошибка. Попробуйте ещё раз.',
    t_claimed:       n => `Вы на Точке #${n}`,
    signal_title:    'Отправить сигнал',
    signal_sub:      'Все участники поиска увидят оповещение',
    sig_found:       'Нашёл что-то!',
    sig_found_sub:   'следы, вещи, тело',
    sig_sos:         'Нужна помощь!',
    sig_sos_sub:     'опасность, травма',
    alert_found_title: 'НАЙДЕНО!',
    alert_sos_title:   'НУЖНА ПОМОЩЬ!',
    alert_found_body:  (id, pt) => `Участник ${id} сообщает о находке${pt !== null ? ` на Точке #${pt + 1}` : ''}`,
    alert_sos_body:    (id, pt) => `Участник ${id} просит помощи${pt !== null ? ` на Точке #${pt + 1}` : ''}`,
    alert_go:          'Перейти к точке',
    t_signal_sent:     'Сигнал отправлен всем участникам',
    chat_title:        'Чат поисковиков',
    chat_placeholder:  'Написать сообщение...',
    chat_empty1:       'Сообщений пока нет.',
    chat_empty2:       'Напишите первым!',
    chat_limit:        'Дневной лимит 15 сообщений исчерпан',
  },
  ing: {
    title:           'Лахар Соьлжа хий тӀа',
    searching:       'ЛАХАР ДО́ДА',
    vol_label1:      'лохош ба',
    vol_label2:      'хи тӀа',
    pts_label1:      'моттигаш',
    pts_label2:      'тохкаш ба',
    zoom_hint:       'Карта гаргадоаладе моттигаш бӀаргагуш хуг йолаш',
    leg_free:        'Мукъа',
    leg_busy:        'ДӀалаьцай',
    leg_mine:        'Вола моттиг',
    leave_btn:       'ДӀавала',
    my_id:           'Са ID:',
    badge_free:      '● МУКЪА Е',
    badge_partial:   '●Укхаз ва',
    badge_full:      '● ДӀАЛАЬЦАЙ',
    btn_claim:       'Укх моттиге дӀао́тта',
    btn_leave:       'Укх моттигера дӀавала',
    btn_close:       'ДӀакъовла',
    you:             '(хьо)',
    since:           'ха',
    point:           'Моттиг',
    already_on:      n => `Хьо Моттиг #${n} тӀа ва/е. Укхазара цкъа дӀавала.`,
    full_note:       n => `Моттиг дӀалаьцай — ${n} меттиг дийзина.`,
    t_freed:         'Моттиг мукъа ялар',
    t_auto_freed:    'Хьа моттиг ше мукъа ялар',
    t_first_leave:   'Цкъа хьай моттигера дӀавала',
    t_just_full:     'Моттиг дӀалаьцай! Вокха моттиге хьажа.',
    t_error:         'ГӀалат. ТӀаккха хьажа.',
    t_claimed:       n => `Хьо Моттиг #${n} тӀа ва`,
    signal_title:    'ДӀадахьийта оарца',
    signal_sub:      'Масса вола доакъашхой бӏаргагургда ер оарца',
    sig_found:       'Корадаьд цхьадола хьам!',
    sig_found_sub:   'тайпанаш, хьамаш',
    sig_sos:         'Новкъостал эш!',
    sig_sos_sub:     'опасность, хьал',
    alert_found_title: 'КОРАДАЬД!',
    alert_sos_title:   'НОВКЪОСТАЛ ЭШ!',
    alert_found_body:  (id, pt) => `Доакъашхо ${id} цхьадола хьам корадаьд${pt !== null ? ` Моттиг #${pt + 1} тӀа` : ''}`,
    alert_sos_body:    (id, pt) => `Доакъашхо ${id} новкъостал лоху${pt !== null ? ` Моттиг #${pt + 1} тӀа` : ''}`,
    alert_go:          'Хьахьо́кха моттига',
    t_signal_sent:     'Ораца дӀадахьийтад масса вола доакъашхошта',
    chat_title:        'Ле́хархой чат',
    chat_placeholder:  'Ӏоязбе хоам...',
    chat_empty1:       'Хоам хӀанзехь бац',
    chat_empty2:       'Ӏоязбе хьайга бале!',
    chat_limit:        'Дийнахьара боарам кхоачабеннаб — 15 хоам',
  }
};

let currentLang = localStorage.getItem('sunzha_lang') || 'ing';

function t(key, ...args) {
  const val = LANGS[currentLang]?.[key] ?? LANGS.ru[key] ?? key;
  return typeof val === 'function' ? val(...args) : val;
}

function setLang(lang) {
  if (!LANGS[lang]) return;
  currentLang = lang;
  localStorage.setItem('sunzha_lang', lang);
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.dataset.i18n;
    if (el.tagName === 'INPUT') el.placeholder = t(key);
    else el.textContent = t(key);
  });
  document.querySelectorAll('.lang-btn').forEach(btn =>
    btn.classList.toggle('active', btn.dataset.lang === lang)
  );
  if (typeof window._onAfterSetLang === 'function') window._onAfterSetLang(lang);
}
