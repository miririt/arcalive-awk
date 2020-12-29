

function addRule() {
  const firstForm = document.querySelector('.rule');
  const tempForm = document.createElement('form');

  document.querySelector('#rules').appendChild(tempForm);
  tempForm.outerHTML = firstForm.outerHTML;

  const inputs = document.querySelectorAll('input');
  inputs.forEach(inputElem => {
    inputElem.addEventListener('change', function() {
      document.querySelector('#jsonRule').value = JSON.stringify([...document.querySelectorAll('#rules .rule')].map(parseRule));
    });
  });

  return document.querySelector('#rules').lastElementChild;
}

function parseRule(ruleElement) {
  try {
    const monitorTab = ruleElement.querySelector('input[name=monitorTab]').value;
    const monitorWord = ruleElement.querySelector('input[name=monitorWord]').value;
    const useVote = ruleElement.querySelector('input[name=useVote]').checked;
    const monitorDownvote = ruleElement.querySelector('input[name=monitorDownvote]').value;
    const shouldHaveComment = ruleElement.querySelector('input[name=shouldHaveComment]').checked;
    const monitorStatus = ruleElement.querySelector(`input[name=monitorStatus]:checked`).value;

    const blockUntil = ruleElement.querySelector('input[name=blockUntil]').value;
    const recover = ruleElement.querySelector('input[name=recover]').checked;
    const remove = ruleElement.querySelector('input[name=remove]').checked;

    return {
      'monitorTab': monitorTab,
      'monitorWord': monitorWord,
      'useVote': useVote,
      'monitorDownvote': monitorDownvote,
      'shouldHaveComment': shouldHaveComment,
      'monitorStatus': monitorStatus,
      'blockUntil': blockUntil,
      'recover': recover,
      'remove': remove
    };
  } catch(err) {
    alert('설정 값에 이상이 있습니다. 확인하고 다시 시도해주세요.');
    throw err;
  }
}

function applyRule(ruleElement, rule) {
  const monitorTab = ruleElement.querySelector('input[name=monitorTab]');
  const monitorWord = ruleElement.querySelector('input[name=monitorWord]');
  const useVote = ruleElement.querySelector('input[name=useVote]');
  const monitorDownvote = ruleElement.querySelector('input[name=monitorDownvote]');
  const shouldHaveComment = ruleElement.querySelector('input[name=shouldHaveComment]');
  const monitorStatusOn = ruleElement.querySelectorAll(`input[name=monitorStatus]`)[0];
  const monitorStatusRemoved = ruleElement.querySelectorAll(`input[name=monitorStatus]`)[1];

  const blockUntil = ruleElement.querySelector('input[name=blockUntil]');
  const recover = ruleElement.querySelector('input[name=recover]');
  const remove = ruleElement.querySelector('input[name=remove]');

  monitorTab.value = rule.monitorTab;
  monitorWord.value = rule.monitorWord;
  useVote.checked = rule.useVote;
  monitorDownvote.value = rule.monitorDownvote;
  shouldHaveComment.checked = rule.shouldHaveComment;
  if(rule.monitorStatus == 'on') {
    monitorStatusOn.checked = true;
  } else {
    monitorStatusRemoved.checked = true;
  }

  blockUntil.value = rule.blockUntil;
  recover.checked = rule.recover;
  remove.checked = rule.remove;
  
  return ruleElement;
}

function subscribe() {
  const subscrForm = document.querySelector('#subscribe-form');
  subscrForm.method = 'POST';
  subscrForm.action = '/subscribe';
  subscrForm.rules.value = JSON.stringify([...document.querySelectorAll('#rules .rule')].map(parseRule));
  subscrForm.submit();
}

function clearRule() {
  const rules = document.querySelector('#rules');
  
  addRule();
  while(rules.querySelectorAll('.rule').length != 1) {
    rules.removeChild(rules.querySelector('.rule'));
  }
}

function loadJsonRule(existingRule) {
  const jsonRule = existingRule || JSON.parse(document.querySelector('#jsonRule').value);

  clearRule();
  for(let i = 0; i < jsonRule.length - 1; i++) {
    addRule();
  }
  const ruleElems = document.querySelectorAll('.rule');
  jsonRule.forEach((rule, idx) => {
    const addedRule = ruleElems[idx];
    applyRule(addedRule, rule);
  });
}

function loadRule() {
  fetch('/rules', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `channel=${encodeURIComponent(document.querySelector('input[name=channel]').value)}`
  }).then(res => res.json())
  .then(json => {
    startRule();
    loadJsonRule(json);
    document.querySelectorAll('input').forEach(_ => {
      _.setAttribute('readonly', '');
      if(_.getAttribute('type') == 'checkbox') {
        _.setAttribute('disabled', '');
      }
    });
    document.querySelector('#jsonRule').value = JSON.stringify([...document.querySelectorAll('#rules .rule')].map(parseRule));
    alert('불러오기 성공.');
  })
  .catch(err => {
    console.error(err);
    alert('불러오기 실패');
  });
}

function startRule() {
  document.querySelectorAll('.hidden').forEach(elem => {
    elem.classList.remove('hidden');
  })
}

function revoke() {
  fetch('/revoke', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `channel=${encodeURIComponent(document.querySelector('input[name=channel]').value)}`
  }).then(res => res.text())
  .then(text => {
    if(text == 'ok') {
      alert('중지 성공.');
    } else {
      alert('중지 실패');
    }
  });
}

function permission() {
  fetch('/check', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `channel=${encodeURIComponent(document.querySelector('input[name=channel]').value)}`
  }).then(res => res.text())
  .then(text => {
    if(text == 'running') {
      alert('권한이 부여된 상태입니다. 규칙을 불러오지만 수정할 수는 없습니다.');
      loadRule();
    } else if(text == 'subscribable') {
      alert('권한이 부여되었으나 실행중이지 않습니다. 규칙 설정을 시작합니다.');
      startRule();
    } else if(text == 'revoke') {
      alert('권한이 해제되었습니다. 자동으로 실행 중지합니다.');
      revoke();
    } else {
      alert('권한 확인 실패');
    }
  });
}
