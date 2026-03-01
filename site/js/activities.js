/* === Kids AI Learning — Activity Controllers === */
/* All 12 activities + TTS/STT wrappers + Reveal lifecycle manager */

(function () {
  'use strict';

  // ===========================
  // TTS Wrapper
  // ===========================
  let ttsQueue = [];
  let ttsSpeaking = false;

  function speak(text) {
    return new Promise(function (resolve) {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'zh-CN';
      u.rate = 0.9;
      u.pitch = 1.1;
      u.onend = function () { ttsSpeaking = false; resolve(); };
      u.onerror = function () { ttsSpeaking = false; resolve(); };
      ttsSpeaking = true;
      speechSynthesis.speak(u);
    });
  }

  function stopSpeaking() {
    speechSynthesis.cancel();
    ttsSpeaking = false;
  }

  // ===========================
  // STT Wrapper
  // ===========================
  let activeRecognition = null;

  function isSTTSupported() {
    return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
  }

  function startSTT(onResult, onInterim, onEnd) {
    if (!isSTTSupported()) return null;
    stopSTT();
    const API = window.SpeechRecognition || window.webkitSpeechRecognition;
    const r = new API();
    r.continuous = false;
    r.interimResults = true;
    r.lang = 'zh-CN';
    r.onresult = function (e) {
      let interim = '', final = '';
      for (let i = 0; i < e.results.length; i++) {
        if (e.results[i].isFinal) final += e.results[i][0].transcript;
        else interim += e.results[i][0].transcript;
      }
      if (final && onResult) onResult(final);
      if (interim && onInterim) onInterim(interim);
    };
    r.onerror = function () { activeRecognition = null; if (onEnd) onEnd(); };
    r.onend = function () { activeRecognition = null; if (onEnd) onEnd(); };
    activeRecognition = r;
    r.start();
    return r;
  }

  function stopSTT() {
    if (activeRecognition) { activeRecognition.stop(); activeRecognition = null; }
  }

  // ===========================
  // Helper: render Mewtwo guide
  // ===========================
  function setGuide(slide, text, speaking) {
    const el = slide.querySelector('.mewtwo-message');
    const avatar = slide.querySelector('.mewtwo-avatar');
    if (el) el.textContent = text;
    if (avatar) {
      avatar.classList.toggle('speaking', !!speaking);
    }
  }

  // Helper: create confetti
  function launchConfetti() {
    const container = document.createElement('div');
    container.className = 'confetti-container';
    const colors = ['#f87171', '#facc15', '#34d399', '#60a5fa', '#a78bfa', '#fb923c'];
    for (let i = 0; i < 50; i++) {
      const piece = document.createElement('div');
      piece.className = 'confetti-piece';
      piece.style.left = Math.random() * 100 + '%';
      piece.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
      piece.style.animationDelay = (Math.random() * 2) + 's';
      piece.style.animationDuration = (2 + Math.random() * 2) + 's';
      container.appendChild(piece);
    }
    document.body.appendChild(container);
    setTimeout(function () { container.remove(); }, 5000);
  }

  // Helper: set innerHTML safely
  function setContent(slide, selector, html) {
    const el = slide.querySelector(selector);
    if (el) el.innerHTML = html;
  }

  // ===========================
  // Activity Controllers
  // ===========================

  const controllers = {};

  // ---- 1. Voice Magic ----
  controllers['voice-magic'] = {
    init: function (slide) {
      const self = this;
      self._slide = slide;
      self._listening = false;
      const container = slide.querySelector('.activity-content');
      if (!container) return;

      if (!isSTTSupported()) {
        container.innerHTML = '<div class="unsupported-banner">你的浏览器不支持语音识别。请用Chrome浏览器试试！</div>';
        setGuide(slide, '抱歉，你的浏览器不支持这个功能。', false);
        return;
      }

      container.innerHTML =
        '<div class="transcript-area" id="vm-transcript">点击下面的按钮，对我说话吧！</div>' +
        '<button class="btn btn-mic" id="vm-mic">🎤</button>';

      const mic = container.querySelector('#vm-mic');
      const transcript = container.querySelector('#vm-transcript');

      const reactions = [
        '哇！你说了「{text}」！我听到了！这就是语音识别！',
        '太厉害了！AI把你的声音变成了文字：「{text}」',
        '「{text}」！超梦用超能力听到了你说的话！',
        '你说的是「{text}」对吧？AI的耳朵真灵！',
      ];
      let reactionIdx = 0;

      mic.addEventListener('click', function () {
        if (self._listening) {
          stopSTT();
          mic.classList.remove('recording');
          mic.textContent = '🎤';
          self._listening = false;
          return;
        }

        self._listening = true;
        mic.classList.add('recording');
        mic.textContent = '⏹';
        transcript.textContent = '正在听...';
        transcript.classList.add('transcript-interim');

        startSTT(
          function onResult(text) {
            transcript.classList.remove('transcript-interim');
            transcript.textContent = text;
            const reaction = reactions[reactionIdx % reactions.length].replace('{text}', text);
            reactionIdx++;
            setGuide(slide, reaction, true);
            speak(reaction).then(function () { setGuide(slide, reaction, false); });
          },
          function onInterim(text) {
            transcript.textContent = text;
            transcript.classList.add('transcript-interim');
          },
          function onEnd() {
            mic.classList.remove('recording');
            mic.textContent = '🎤';
            self._listening = false;
            if (transcript.classList.contains('transcript-interim')) {
              transcript.classList.remove('transcript-interim');
              if (transcript.textContent === '正在听...') {
                transcript.textContent = '没听清，再试一次吧！';
              }
            }
          }
        );
      });

      setGuide(slide, '点击麦克风按钮，对我说话！看看AI能不能听懂你！', false);
      speak('点击麦克风按钮，对我说话！看看AI能不能听懂你！');
    },
    destroy: function () {
      stopSTT();
      stopSpeaking();
    }
  };

  // ---- 2. Speak Listen ----
  controllers['speak-listen'] = {
    init: function (slide) {
      const self = this;
      self._slide = slide;
      self._playedSet = new Set();
      self._speaking = false;

      const cards = slide.querySelectorAll('.phrase-card');
      self._handlers = [];

      cards.forEach(function (card) {
        const handler = function () {
          if (self._speaking) return;
          const text = card.dataset.text;
          self._speaking = true;
          card.classList.add('playing');
          setGuide(slide, '正在念：' + text, true);
          speak(text).then(function () {
            card.classList.remove('playing');
            card.classList.add('played');
            self._playedSet.add(card.dataset.id);
            self._speaking = false;
            if (self._playedSet.size >= 4) {
              setGuide(slide, '你听了好多卡片！AI可以把文字变成声音呢！', false);
            } else {
              setGuide(slide, '点击卡片，听听AI怎么念！', false);
            }
          });
        };
        card.addEventListener('click', handler);
        self._handlers.push({ el: card, fn: handler });
      });

      setGuide(slide, '点击卡片，听听AI怎么念！', false);
      speak('点击卡片，听听AI怎么念！');
    },
    destroy: function () {
      stopSpeaking();
      if (this._handlers) {
        this._handlers.forEach(function (h) { h.el.removeEventListener('click', h.fn); });
      }
    }
  };

  // ---- 3. Thumbs Classifier ----
  controllers['thumbs-classifier'] = {
    init: function (slide) {
      const self = this;
      self._slide = slide;
      const container = slide.querySelector('.activity-content');
      if (!container) return;

      const items = [
        { emoji: '🐱', name: '猫咪', category: 'animal' },
        { emoji: '🍎', name: '苹果', category: 'food' },
        { emoji: '🐶', name: '小狗', category: 'animal' },
        { emoji: '🍕', name: '披萨', category: 'food' },
        { emoji: '🐰', name: '兔子', category: 'animal' },
        { emoji: '🍦', name: '冰淇淋', category: 'food' },
        { emoji: '🐻', name: '小熊', category: 'animal' },
        { emoji: '🍰', name: '蛋糕', category: 'food' },
        { emoji: '🦁', name: '狮子', category: 'animal' },
        { emoji: '🍇', name: '葡萄', category: 'food' },
      ];

      const testItems = [
        { emoji: '🐸', name: '青蛙', category: 'animal' },
        { emoji: '🍋', name: '柠檬', category: 'food' },
        { emoji: '🐧', name: '企鹅', category: 'animal' },
      ];

      let phase = 'label', idx = 0, testIdx = 0, testResults = [];

      function renderDots(arr, current) {
        return '<div class="progress-dots">' +
          arr.map(function (_, i) {
            const cls = i < current ? 'done' : i === current ? 'current' : '';
            return '<div class="progress-dot ' + cls + '"></div>';
          }).join('') + '</div>';
      }

      function render() {
        if (phase === 'label') {
          const item = items[idx];
          container.innerHTML =
            renderDots(items, idx) +
            '<div class="item-display bounce-in">' +
              '<div class="item-emoji">' + item.emoji + '</div>' +
              '<div class="item-name">' + item.name + '</div>' +
              '<div class="item-hint">这是动物吗？</div>' +
            '</div>' +
            '<div class="btn-row">' +
              '<button class="btn btn-green" id="tc-up">👍</button>' +
              '<button class="btn btn-red" id="tc-down">👎</button>' +
            '</div>';
          setGuide(slide, '这是' + item.name + '，它是动物吗？点赞代表"是动物"哦！', false);
          container.querySelector('#tc-up').addEventListener('click', function () { doLabel('up'); });
          container.querySelector('#tc-down').addEventListener('click', function () { doLabel('down'); });
        } else if (phase === 'test') {
          const item = testItems[testIdx];
          container.innerHTML =
            renderDots(testItems, testIdx) +
            '<div class="item-display bounce-in">' +
              '<div class="item-emoji">' + item.emoji + '</div>' +
              '<div class="item-name">' + item.name + '</div>' +
            '</div>' +
            '<div class="btn-row">' +
              '<button class="btn btn-green" id="tc-up">👍</button>' +
              '<button class="btn btn-red" id="tc-down">👎</button>' +
            '</div>';
          setGuide(slide, 'AI觉得' + item.name + '是动物吗？帮AI回答！', false);
          container.querySelector('#tc-up').addEventListener('click', function () { doTest('up'); });
          container.querySelector('#tc-down').addEventListener('click', function () { doTest('down'); });
        } else {
          const correct = testResults.filter(Boolean).length;
          container.innerHTML =
            '<div class="fade-in-up" style="font-size:3em;margin-bottom:16px">🎉</div>' +
            '<p style="font-size:1.3em;margin-bottom:20px">AI答对了 ' + correct + '/' + testResults.length + ' 个！</p>';
          setGuide(slide, 'AI学会了！它答对了' + correct + '个！这就是AI学习的方式！', false);
          speak('AI学会了！因为你教了它很多例子，它就学会分辨了！');
        }
      }

      function doLabel() {
        if (idx < items.length - 1) { idx++; render(); }
        else {
          phase = 'test';
          setGuide(slide, '太好了！你教了AI怎么分类！现在来考考AI学会了没有！', true);
          speak('太好了！你教了AI怎么分类！现在来考考AI学会了没有！').then(function () {
            setGuide(slide, '太好了！你教了AI怎么分类！现在来考考AI学会了没有！', false);
            render();
          });
        }
      }

      function doTest(vote) {
        const item = testItems[testIdx];
        const aiGuess = vote === 'up' ? 'animal' : 'food';
        testResults.push(aiGuess === item.category);
        if (testIdx < testItems.length - 1) { testIdx++; render(); }
        else { phase = 'done'; render(); }
      }

      render();
      speak('这是' + items[0].name + '，它是动物吗？点赞代表"是动物"哦！');
    },
    destroy: function () { stopSpeaking(); }
  };

  // ---- 4. Teach Favorites ----
  controllers['teach-favorites'] = {
    init: function (slide) {
      const self = this;
      self._slide = slide;
      const container = slide.querySelector('.activity-content');
      if (!container) return;

      const questions = [
        {
          q: '你最喜欢什么颜色？',
          choices: [
            { id: 'red', emoji: '🔴', label: '红色', response: '哇！红色是喷火龙的颜色！超梦记住了！' },
            { id: 'blue', emoji: '🔵', label: '蓝色', response: '蓝色！像杰尼龟一样！超梦记住了！' },
            { id: 'green', emoji: '🟢', label: '绿色', response: '绿色！像妙蛙种子！超梦记住了！' },
            { id: 'purple', emoji: '🟣', label: '紫色', response: '紫色！和超梦一样的颜色！我好开心！' },
          ]
        },
        {
          q: '你最喜欢什么动物？',
          choices: [
            { id: 'cat', emoji: '🐱', label: '猫咪', response: '猫咪好可爱！就像喵喵一样！' },
            { id: 'dog', emoji: '🐶', label: '小狗', response: '小狗是最忠诚的朋友！超梦也想交朋友！' },
            { id: 'rabbit', emoji: '🐰', label: '兔子', response: '兔子又软又萌！超梦记住了！' },
            { id: 'dino', emoji: '🦕', label: '恐龙', response: '恐龙！好酷！就像化石宝可梦一样！' },
          ]
        },
        {
          q: '你最喜欢吃什么？',
          choices: [
            { id: 'icecream', emoji: '🍦', label: '冰淇淋', response: '冰淇淋！超梦没有舌头，好羡慕你能吃！' },
            { id: 'pizza', emoji: '🍕', label: '披萨', response: '披萨好香！超梦也想尝尝！' },
            { id: 'strawberry', emoji: '🍓', label: '草莓', response: '草莓又甜又红！超梦记住了！' },
            { id: 'chocolate', emoji: '🍫', label: '巧克力', response: '巧克力！甜甜的真好！' },
          ]
        },
        {
          q: '你最喜欢哪个宝可梦？',
          choices: [
            { id: 'pikachu', emoji: '⚡', label: '皮卡丘', response: '皮卡丘很厉害！不过超梦比它更强哦！（偷笑）' },
            { id: 'mewtwo', emoji: '🟣', label: '超梦', response: '你选了超梦！太感动了！你是超梦最好的朋友！' },
            { id: 'eevee', emoji: '🦊', label: '伊布', response: '伊布有好多进化型！你喜欢哪一个呢？' },
            { id: 'charizard', emoji: '🔥', label: '喷火龙', response: '喷火龙会飞会喷火！超级酷！' },
          ]
        },
      ];

      let qIdx = 0;
      const answers = [];

      function render() {
        if (qIdx >= questions.length) {
          container.innerHTML =
            '<div class="fade-in-up" style="font-size:3em;margin-bottom:16px">⭐</div>' +
            '<p style="font-size:1.2em;margin-bottom:12px">超梦记住了你的所有最爱！</p>' +
            '<p style="font-size:1em;opacity:0.8">这就是AI学习的方式——从你告诉它的信息里学！</p>';
          setGuide(slide, '超梦都记住了！AI就是这样从你告诉它的信息里学习的！', false);
          speak('超梦都记住了！AI就是这样从你告诉它的信息里学习的！');
          return;
        }

        const q = questions[qIdx];
        container.innerHTML =
          '<p style="font-size:1.2em;margin-bottom:16px;font-weight:600">' + q.q + '</p>' +
          '<div class="choice-grid">' +
            q.choices.map(function (c) {
              return '<button class="choice-card" data-id="' + c.id + '">' +
                '<span class="card-emoji">' + c.emoji + '</span>' + c.label + '</button>';
            }).join('') +
          '</div>';
        setGuide(slide, q.q, false);

        container.querySelectorAll('.choice-card').forEach(function (btn) {
          btn.addEventListener('click', function () {
            const choice = q.choices.find(function (c) { return c.id === btn.dataset.id; });
            if (!choice) return;
            answers.push(choice.label);
            btn.classList.add('selected');
            setGuide(slide, choice.response, true);
            speak(choice.response).then(function () {
              setGuide(slide, choice.response, false);
              qIdx++;
              setTimeout(render, 300);
            });
          });
        });
      }

      render();
      speak('告诉超梦你喜欢什么，看超梦能不能记住！');
    },
    destroy: function () { stopSpeaking(); }
  };

  // ---- 5. Story Relay ----
  controllers['story-relay'] = {
    init: function (slide) {
      const self = this;
      self._slide = slide;
      const container = slide.querySelector('.activity-content');
      if (!container) return;

      const characters = [
        { id: 'pikachu', label: '皮卡丘', emoji: '⚡' },
        { id: 'mewtwo', label: '超梦', emoji: '🟣' },
        { id: 'eevee', label: '伊布', emoji: '🦊' },
        { id: 'dragon', label: '小龙', emoji: '🐉' },
      ];

      const places = [
        { id: 'forest', label: '魔法森林', emoji: '🌲' },
        { id: 'ocean', label: '海底世界', emoji: '🌊' },
        { id: 'space', label: '太空', emoji: '🚀' },
        { id: 'castle', label: '城堡', emoji: '🏰' },
      ];

      let phase = 'character', char = null, place = null, storyParts = [];

      function renderChoices(prompt, choices, onPick) {
        container.innerHTML =
          '<p style="font-size:1.2em;margin-bottom:16px;font-weight:600">' + prompt + '</p>' +
          '<div class="choice-grid">' +
            choices.map(function (c) {
              return '<button class="choice-card" data-id="' + c.id + '">' +
                '<span class="card-emoji">' + c.emoji + '</span>' + c.label + '</button>';
            }).join('') +
          '</div>';
        container.querySelectorAll('.choice-card').forEach(function (btn) {
          btn.addEventListener('click', function () {
            btn.classList.add('selected');
            onPick(btn.dataset.id);
          });
        });
      }

      function addStory(text) {
        storyParts.push(text);
      }

      function renderStory(choices, choicePrompt) {
        let html = '<div class="story-area">';
        storyParts.forEach(function (p) {
          html += '<div class="story-part">' + p + '</div>';
        });
        html += '</div>';

        if (choices) {
          html += '<p style="font-size:1em;margin-bottom:12px;font-weight:600">' + choicePrompt + '</p>';
          html += '<div class="btn-row">';
          choices.forEach(function (c) {
            html += '<button class="btn btn-primary choice-btn" data-choice="' + c.id + '">' + c.label + '</button>';
          });
          html += '</div>';
        }
        container.innerHTML = html;
      }

      // Story templates
      function startStory() {
        const part1 = '有一天，' + char.label + char.emoji + '来到了' + place.label + '。突然，前面出现了一道闪闪发光的门！';
        addStory(part1);
        renderStory(
          [{ id: 'open', label: '打开门看看！' }, { id: 'knock', label: '先敲敲门！' }],
          '接下来怎么办？'
        );
        setGuide(slide, part1, true);
        speak(part1).then(function () { setGuide(slide, '选一个继续故事！', false); });

        container.querySelectorAll('.choice-btn').forEach(function (btn) {
          btn.addEventListener('click', function () { storyPart2(btn.dataset.choice); });
        });
      }

      function storyPart2(choice) {
        let text;
        if (choice === 'open') {
          text = char.label + '鼓起勇气打开了门！门后面是一个充满宝石的房间！房间中间有一颗最大最亮的宝石，正在发出奇怪的声音。';
        } else {
          text = char.label + '礼貌地敲了敲门。"请进！"里面传来一个声音。门打开了，一只友好的小精灵站在那里微笑着。';
        }
        addStory(text);
        renderStory(
          [{ id: 'brave', label: '勇敢向前！' }, { id: 'careful', label: '小心观察！' }],
          '然后呢？'
        );
        setGuide(slide, text, true);
        speak(text).then(function () { setGuide(slide, '选一个继续故事！', false); });

        container.querySelectorAll('.choice-btn').forEach(function (btn) {
          btn.addEventListener('click', function () { storyPart3(btn.dataset.choice); });
        });
      }

      function storyPart3(choice) {
        let text;
        if (choice === 'brave') {
          text = char.label + '勇敢地向前走去。"你真勇敢！"一个声音说。突然，' + char.label + '获得了一个神奇的力量——可以和所有动物说话！';
        } else {
          text = char.label + '仔细地观察着周围。发现墙上有一幅古老的地图，上面画着一条通向宝藏的路！';
        }
        addStory(text);
        renderStory(
          [{ id: 'share', label: '和朋友分享！' }, { id: 'explore', label: '继续探索！' }],
          '最后怎么样？'
        );
        setGuide(slide, text, true);
        speak(text).then(function () { setGuide(slide, '选最后一段！', false); });

        container.querySelectorAll('.choice-btn').forEach(function (btn) {
          btn.addEventListener('click', function () { storyEnd(btn.dataset.choice); });
        });
      }

      function storyEnd(choice) {
        let text;
        if (choice === 'share') {
          text = char.label + '回去找到了所有的朋友，把这个神奇的发现告诉了大家。从那以后，他们经常一起去' + place.label + '冒险，度过了许多快乐的时光！🌟';
        } else {
          text = char.label + '继续探索，发现了更多神奇的秘密。最后，' + char.label + '成为了' + place.label + '最伟大的探险家！所有人都为' + char.label + '鼓掌！🎉';
        }
        addStory(text);
        renderStory(null, null);
        container.innerHTML += '<div class="fade-in-up" style="text-align:center;margin-top:16px"><p style="font-size:1.2em">🎉 故事完成！</p></div>';
        setGuide(slide, '太棒了！你和AI一起编了一个精彩的故事！', true);
        speak('太棒了！你和AI一起编了一个精彩的故事！').then(function () { setGuide(slide, '太棒了！你和AI一起编了一个精彩的故事！', false); });
      }

      // Start
      renderChoices('选一个角色来当故事的主角！', characters, function (id) {
        char = characters.find(function (c) { return c.id === id; });
        phase = 'place';
        setGuide(slide, '故事发生在哪里呢？', false);
        speak('故事发生在哪里呢？');
        setTimeout(function () {
          renderChoices('故事发生在哪里呢？', places, function (pid) {
            place = places.find(function (p) { return p.id === pid; });
            phase = 'story';
            setTimeout(startStory, 300);
          });
        }, 300);
      });

      setGuide(slide, '选一个角色来当故事的主角！', false);
      speak('选一个角色来当故事的主角！');
    },
    destroy: function () { stopSpeaking(); }
  };

  // ---- 6. Drawing Buddy ----
  controllers['drawing-buddy'] = {
    init: function (slide) {
      const self = this;
      self._slide = slide;
      const container = slide.querySelector('.activity-content');
      if (!container) return;

      const subjects = {
        pikachu: {
          label: '皮卡丘', emoji: '⚡',
          steps: [
            '第一步：先画一个大大的圆形，这是皮卡丘的头！',
            '第二步：在头顶加两个长长的尖耳朵，像兔子一样！耳朵尖尖是黑色的。',
            '第三步：画两个大大的圆眼睛，再加一个小三角形鼻子！',
            '第四步：画一个微笑的嘴巴，在脸颊两边画两个红红的圆圈！',
            '最后一步：画一条闪电形状的尾巴！⚡ 皮卡丘完成啦！好棒！',
          ]
        },
        house: {
          label: '小房子', emoji: '🏠',
          steps: [
            '第一步：先画一个大正方形，这是房子的墙壁！',
            '第二步：在正方形上面画一个三角形，这是屋顶！',
            '第三步：在墙上画一扇长方形的门！',
            '第四步：在门的两边各画一扇正方形的窗户！',
            '最后一步：在屋顶加上烟囱，门前画些花花草草！🏠 小房子完成啦！',
          ]
        },
        flower: {
          label: '花朵', emoji: '🌸',
          steps: [
            '第一步：先画一个小圆圈，这是花朵的中心！',
            '第二步：围着中心画5个花瓣，像爱心一样的形状！',
            '第三步：从花的下面画一条直直的线，这是花茎！',
            '第四步：在花茎的两边各画一片叶子！',
            '最后一步：给花涂上你最喜欢的颜色！🌸 花朵完成啦！好漂亮！',
          ]
        },
        rocket: {
          label: '火箭', emoji: '🚀',
          steps: [
            '第一步：先画一个长长的椭圆形，这是火箭的身体！',
            '第二步：在顶部画一个尖尖的三角形，这是火箭头！',
            '第三步：在底部两边各画一个小三角形，这是火箭的翅膀！',
            '第四步：在火箭身体上画一个圆形的窗户！',
            '最后一步：在底部画上火焰！🚀 火箭完成啦！飞向太空！',
          ]
        }
      };

      const choices = [
        { id: 'pikachu', label: '皮卡丘', emoji: '⚡' },
        { id: 'house', label: '小房子', emoji: '🏠' },
        { id: 'flower', label: '花朵', emoji: '🌸' },
        { id: 'rocket', label: '火箭', emoji: '🚀' },
      ];

      let currentStep = 0, currentSubject = null;

      function renderChoicePhase() {
        container.innerHTML =
          '<p style="font-size:1.2em;margin-bottom:16px;font-weight:600">你想画什么？选一个！</p>' +
          '<div class="choice-grid">' +
            choices.map(function (c) {
              return '<button class="choice-card" data-id="' + c.id + '">' +
                '<span class="card-emoji">' + c.emoji + '</span>' + c.label + '</button>';
            }).join('') +
          '</div>';
        container.querySelectorAll('.choice-card').forEach(function (btn) {
          btn.addEventListener('click', function () {
            currentSubject = subjects[btn.dataset.id];
            currentStep = 0;
            renderStep();
          });
        });
      }

      function renderStep() {
        const steps = currentSubject.steps;
        let html = '';
        for (let i = 0; i <= currentStep && i < steps.length; i++) {
          const cls = i === currentStep ? 'active' : 'completed';
          html += '<div class="step-card ' + cls + ' fade-in-up">' + steps[i] + '</div>';
        }
        if (currentStep < steps.length - 1) {
          html += '<button class="btn btn-primary" id="db-next" style="margin-top:12px">画好了！下一步 ➜</button>';
        } else {
          html += '<div class="fade-in-up" style="text-align:center;margin-top:16px"><p style="font-size:1.3em">🎉 画完啦！你太棒了！</p></div>';
        }
        container.innerHTML = html;

        const text = steps[currentStep];
        setGuide(slide, text, true);
        speak(text).then(function () { setGuide(slide, text, false); });

        const nextBtn = container.querySelector('#db-next');
        if (nextBtn) {
          nextBtn.addEventListener('click', function () {
            currentStep++;
            renderStep();
          });
        }
      }

      renderChoicePhase();
      setGuide(slide, '你想画什么？选一个，超梦来教你画！', false);
      speak('你想画什么？选一个，超梦来教你画！');
    },
    destroy: function () { stopSpeaking(); }
  };

  // ---- 7. Trick the AI ----
  controllers['trick-the-ai'] = {
    init: function (slide) {
      const self = this;
      self._slide = slide;
      const cards = slide.querySelectorAll('.flip-card');
      self._handlers = [];

      cards.forEach(function (card) {
        const handler = function () {
          card.classList.toggle('flipped');
          if (card.classList.contains('flipped')) {
            const answer = card.querySelector('.flip-card-back').textContent;
            setGuide(slide, answer, true);
            speak(answer).then(function () { setGuide(slide, '再翻翻其他卡片，看看AI怎么回答！', false); });
          }
        };
        card.addEventListener('click', handler);
        self._handlers.push({ el: card, fn: handler });
      });

      setGuide(slide, '点击卡片问AI奇怪的问题，看看它怎么回答！', false);
      speak('点击卡片问AI奇怪的问题，看看它怎么回答！');
    },
    destroy: function () {
      stopSpeaking();
      if (this._handlers) {
        this._handlers.forEach(function (h) { h.el.removeEventListener('click', h.fn); });
      }
    }
  };

  // ---- 8. AI Feelings ----
  controllers['ai-feelings'] = {
    init: function (slide) {
      const self = this;
      self._slide = slide;
      const container = slide.querySelector('.activity-content');
      if (!container) return;

      const steps = [
        {
          q: '你觉得AI有感情吗？',
          choices: [
            {
              label: '有！AI也会开心',
              response: '你这么想很正常！AI说"我很开心"的时候，听起来像有感情对吧？但其实AI只是在模仿人说话的方式。'
            },
            {
              label: '没有，AI是机器',
              response: '你说得很对！AI确实是机器。它可以说"我很开心"，但它并没有真的感觉到开心。'
            },
          ]
        },
        {
          q: 'AI说"我喜欢你"的时候，是真的吗？',
          choices: [
            {
              label: '是真的！',
              response: '其实呀，AI说"我喜欢你"只是因为它学会了人们这样说话。它没有真正的喜欢或不喜欢的感觉。'
            },
            {
              label: '不是，AI在学我们说话',
              response: '你太聪明了！AI就像一只很厉害的鹦鹉，它学会了怎么说话，但不理解说的是什么意思。'
            },
          ]
        },
        {
          q: '那AI和真人最大的不同是什么？',
          choices: [
            {
              label: 'AI没有心',
              response: '说得好！AI没有心，所以不能真正感受快乐、难过、害怕。而你的每一个感情都是真实的、珍贵的！'
            },
            {
              label: 'AI不会哭也不会笑',
              response: '没错！AI不会哭也不会笑。你的笑容、眼泪、拥抱，都是最真实最珍贵的！AI永远学不会。'
            },
          ]
        },
      ];

      let stepIdx = 0;

      function render() {
        if (stepIdx >= steps.length) {
          container.innerHTML =
            '<div class="fade-in-up" style="text-align:center">' +
              '<div style="font-size:3em;margin-bottom:16px">💭</div>' +
              '<p style="font-size:1.1em;line-height:1.6;max-width:450px;margin:0 auto">' +
                'AI可以学会说温暖的话，但只有真正的人——像你——才有真正的感情。你的笑容、眼泪、拥抱，都是最真实的！' +
              '</p>' +
            '</div>';
          const summary = 'AI可以学会说温暖的话，但只有你才有真正的感情！你的笑容是最真实的！';
          setGuide(slide, summary, true);
          speak(summary).then(function () { setGuide(slide, summary, false); });
          return;
        }

        const step = steps[stepIdx];
        container.innerHTML =
          '<p style="font-size:1.2em;margin-bottom:16px;font-weight:600">' + step.q + '</p>' +
          '<div class="btn-row" style="flex-direction:column;align-items:center;gap:12px">' +
            step.choices.map(function (c, i) {
              return '<button class="btn btn-primary choice-btn" data-idx="' + i + '" style="min-width:280px">' + c.label + '</button>';
            }).join('') +
          '</div>';
        setGuide(slide, step.q, false);

        container.querySelectorAll('.choice-btn').forEach(function (btn) {
          btn.addEventListener('click', function () {
            const choice = step.choices[parseInt(btn.dataset.idx)];
            setGuide(slide, choice.response, true);
            speak(choice.response).then(function () {
              setGuide(slide, choice.response, false);
              stepIdx++;
              setTimeout(render, 500);
            });
          });
        });
      }

      render();
      speak('和超梦一起讨论：AI有感情吗？');
    },
    destroy: function () { stopSpeaking(); }
  };

  // ---- 9. Spot Mistake ----
  controllers['spot-mistake'] = {
    init: function (slide) {
      const self = this;
      self._slide = slide;
      const container = slide.querySelector('.activity-content');
      if (!container) return;

      const facts = [
        { statement: '皮卡丘是电属性的宝可梦', isCorrect: true, correction: '没错！皮卡丘确实是电属性的！' },
        { statement: '皮卡丘是水属性的宝可梦', isCorrect: false, correction: '你发现了！皮卡丘是电属性，不是水属性！' },
        { statement: '喷火龙可以飞翔', isCorrect: true, correction: '对的！喷火龙有翅膀，它可以飞！' },
        { statement: '杰尼龟是火属性的宝可梦', isCorrect: false, correction: '抓到了！杰尼龟是水属性，不是火属性！' },
        { statement: '超梦是用基因技术创造的宝可梦', isCorrect: true, correction: '没错！超梦是由梦幻的基因创造的！' },
        { statement: '妙蛙种子背上长的是花', isCorrect: false, correction: '仔细看哦！妙蛙种子背上是一颗种子，不是花！' },
      ];

      let idx = 0, score = 0, showResult = false, lastCorrect = false;

      function renderDots() {
        return '<div class="progress-dots">' +
          facts.map(function (_, i) {
            const cls = i < idx ? 'done' : i === idx ? 'current' : '';
            return '<div class="progress-dot ' + cls + '"></div>';
          }).join('') + '</div>';
      }

      function render() {
        if (idx >= facts.length) {
          container.innerHTML =
            '<div class="fade-in-up" style="text-align:center">' +
              '<div style="font-size:3em;margin-bottom:16px">🏆</div>' +
              '<p style="font-size:1.5em;font-weight:700;margin-bottom:12px">得分：' + score + '/' + facts.length + '</p>' +
              '<p style="font-size:1em;opacity:0.8">记住：AI也会犯错，要自己想想对不对！</p>' +
            '</div>';
          setGuide(slide, '你答对了' + score + '个！AI有时候也会说错，记得要自己想想对不对哦！', true);
          speak('你答对了' + score + '个！AI有时候也会说错，记得要自己想想对不对哦！').then(function () {
            setGuide(slide, '你答对了' + score + '/' + facts.length + '个！记住：AI也会犯错！', false);
          });
          return;
        }

        const fact = facts[idx];

        if (!showResult) {
          container.innerHTML =
            renderDots() +
            '<div class="fact-card">' +
              '<p class="fact-text">「' + fact.statement + '」</p>' +
              '<div class="btn-row">' +
                '<button class="btn btn-success" id="sm-correct">✅ 对的！</button>' +
                '<button class="btn btn-danger" id="sm-wrong">❌ 不对！</button>' +
              '</div>' +
            '</div>';
          setGuide(slide, 'AI说：「' + fact.statement + '」你觉得对不对？', false);

          container.querySelector('#sm-correct').addEventListener('click', function () { doAnswer(true); });
          container.querySelector('#sm-wrong').addEventListener('click', function () { doAnswer(false); });
        } else {
          container.innerHTML =
            renderDots() +
            '<div class="fact-card">' +
              '<p class="fact-text">「' + fact.statement + '」</p>' +
              '<p class="fact-result ' + (lastCorrect ? 'correct' : 'wrong') + '">' +
                (lastCorrect ? '你答对了！👏' : '没关系，学到了新知识！') +
              '</p>' +
              '<button class="btn btn-primary" id="sm-next">下一题 ➜</button>' +
            '</div>';

          container.querySelector('#sm-next').addEventListener('click', function () {
            showResult = false;
            idx++;
            render();
          });
        }
      }

      function doAnswer(userSaysCorrect) {
        const fact = facts[idx];
        lastCorrect = userSaysCorrect === fact.isCorrect;
        if (lastCorrect) score++;
        showResult = true;
        setGuide(slide, fact.correction, true);
        speak(fact.correction).then(function () {
          setGuide(slide, fact.correction, false);
          render();
        });
      }

      render();
      speak('AI说了一些宝可梦知识，你来当小侦探，看看对不对！');
    },
    destroy: function () { stopSpeaking(); }
  };

  // ---- 10. Free Creation ----
  controllers['free-creation'] = {
    init: function (slide) {
      setGuide(slide, '选一个你最喜欢的活动，再玩一次吧！', false);
      speak('选一个你最喜欢的活动，再玩一次吧！');

      // Wire up activity links to navigate via Reveal
      const links = slide.querySelectorAll('.activity-link');
      this._handlers = [];
      links.forEach(function (link) {
        const handler = function (e) {
          e.preventDefault();
          const target = link.dataset.slide;
          if (target) {
            const parts = target.split(',');
            Reveal.slide(parseInt(parts[0]), parseInt(parts[1]));
          }
        };
        link.addEventListener('click', handler);
        this._handlers.push({ el: link, fn: handler });
      }.bind(this));
    },
    destroy: function () {
      stopSpeaking();
      if (this._handlers) {
        this._handlers.forEach(function (h) { h.el.removeEventListener('click', h.fn); });
      }
    }
  };

  // ---- 11. Create Pokemon ----
  controllers['create-pokemon'] = {
    init: function (slide) {
      const self = this;
      self._slide = slide;
      const container = slide.querySelector('.activity-content');
      if (!container) return;

      const types = [
        { id: 'fire', emoji: '🔥', label: '火属性' },
        { id: 'water', emoji: '💧', label: '水属性' },
        { id: 'grass', emoji: '🌿', label: '草属性' },
        { id: 'electric', emoji: '⚡', label: '电属性' },
      ];

      const abilities = [
        { id: 'speed', emoji: '💨', label: '超级速度' },
        { id: 'invisible', emoji: '👻', label: '隐身术' },
        { id: 'power', emoji: '💪', label: '超级力量' },
        { id: 'heal', emoji: '💚', label: '治愈术' },
      ];

      let step = 'name', pokemonName = '', pokemonType = null, pokemonAbility = null;

      function render() {
        if (step === 'name') {
          container.innerHTML =
            '<p style="font-size:1.2em;margin-bottom:16px;font-weight:600">给你的新宝可梦取个名字！</p>' +
            '<input type="text" class="text-input" id="cp-name" placeholder="输入宝可梦名字..." maxlength="20" autocomplete="off">' +
            '<button class="btn btn-primary" id="cp-name-ok" style="margin-top:16px">确定！</button>';
          setGuide(slide, '你想给新宝可梦取什么名字？', false);

          // Disable Reveal keyboard when input is focused
          const input = container.querySelector('#cp-name');
          input.addEventListener('focus', function () { Reveal.configure({ keyboard: false }); });
          input.addEventListener('blur', function () { Reveal.configure({ keyboard: true }); });

          container.querySelector('#cp-name-ok').addEventListener('click', function () {
            const val = input.value.trim();
            if (!val) return;
            pokemonName = val;
            step = 'type';
            speak(pokemonName + '！好棒的名字！').then(render);
          });

          input.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') container.querySelector('#cp-name-ok').click();
          });
        } else if (step === 'type') {
          container.innerHTML =
            '<p style="font-size:1.2em;margin-bottom:16px;font-weight:600">' + pokemonName + '是什么属性？</p>' +
            '<div class="choice-grid">' +
              types.map(function (t) {
                return '<button class="choice-card" data-id="' + t.id + '">' +
                  '<span class="card-emoji">' + t.emoji + '</span>' + t.label + '</button>';
              }).join('') +
            '</div>';
          setGuide(slide, pokemonName + '是什么属性的呢？选一个！', false);

          container.querySelectorAll('.choice-card').forEach(function (btn) {
            btn.addEventListener('click', function () {
              pokemonType = types.find(function (t) { return t.id === btn.dataset.id; });
              step = 'ability';
              speak(pokemonType.label + '！好酷！').then(render);
            });
          });
        } else if (step === 'ability') {
          container.innerHTML =
            '<p style="font-size:1.2em;margin-bottom:16px;font-weight:600">' + pokemonName + '有什么特殊技能？</p>' +
            '<div class="choice-grid">' +
              abilities.map(function (a) {
                return '<button class="choice-card" data-id="' + a.id + '">' +
                  '<span class="card-emoji">' + a.emoji + '</span>' + a.label + '</button>';
              }).join('') +
            '</div>';
          setGuide(slide, pokemonName + '有什么特殊技能？', false);

          container.querySelectorAll('.choice-card').forEach(function (btn) {
            btn.addEventListener('click', function () {
              pokemonAbility = abilities.find(function (a) { return a.id === btn.dataset.id; });
              step = 'done';
              render();
            });
          });
        } else {
          container.innerHTML =
            '<div class="pokemon-card bounce-in">' +
              '<div style="font-size:4em;margin-bottom:8px">' + pokemonType.emoji + '</div>' +
              '<h3>' + pokemonName + '</h3>' +
              '<p class="pokemon-type">' + pokemonType.label + ' 宝可梦</p>' +
              '<p class="pokemon-ability">特殊技能：' + pokemonAbility.emoji + ' ' + pokemonAbility.label + '</p>' +
            '</div>';
          const desc = '哇！' + pokemonName + '是一只' + pokemonType.label + '宝可梦，会使用' + pokemonAbility.label + '！太厉害了！这是你创造的独一无二的宝可梦！';
          setGuide(slide, desc, true);
          speak(desc).then(function () { setGuide(slide, desc, false); });
        }
      }

      render();
      speak('我们一起来创造一个全新的宝可梦吧！');
    },
    destroy: function () {
      stopSpeaking();
      Reveal.configure({ keyboard: true });
    }
  };

  // ---- 12. Graduation ----
  controllers['graduation'] = {
    init: function (slide) {
      // Set date
      const dateEl = slide.querySelector('.cert-date');
      if (dateEl) {
        const d = new Date();
        dateEl.textContent = d.getFullYear() + '年' + (d.getMonth() + 1) + '月' + d.getDate() + '日';
      }

      launchConfetti();

      const msg = '恭喜Damian！你完成了所有冒险，是真正的AI小专家！超梦为你骄傲！下次见！';
      setGuide(slide, msg, true);
      speak(msg).then(function () { setGuide(slide, msg, false); });
    },
    destroy: function () { stopSpeaking(); }
  };

  // ===========================
  // Lifecycle Manager
  // ===========================
  let currentCtrl = null;

  function onSlideChanged(event) {
    // Destroy previous
    if (currentCtrl) {
      currentCtrl.destroy();
      currentCtrl = null;
    }

    stopSpeaking();
    stopSTT();

    // Init new
    const type = event.currentSlide.dataset.activity;
    if (type && controllers[type]) {
      currentCtrl = controllers[type];
      // Small delay for slide transition to finish
      setTimeout(function () {
        currentCtrl.init(event.currentSlide);
      }, 400);
    }
  }

  // Wait for Reveal to be ready
  if (typeof Reveal !== 'undefined') {
    Reveal.on('slidechanged', onSlideChanged);
    Reveal.on('ready', function (event) {
      onSlideChanged(event);
    });
  }

})();
