(() => {
  'use strict';

  const STORAGE_KEY = 'retireplan-inputs-v1';
  const defaults = {
    currentAge: 35,
    retireAge: 60,
    lifeAge: 90,
    currentSavings: 1000000,
    monthlyContribution: 20000,
    contributionGrowth: 3,
    retirementLumpSum: 0,
    monthlyExpense: 50000,
    monthlyPension: 0,
    inflation: 2.5,
    safetyMargin: 10,
    preReturn: 6,
    postReturn: 4
  };

  const inputIds = Object.keys(defaults);
  const inputs = Object.fromEntries(inputIds.map(id => [id, document.getElementById(id)]));
  const els = {
    requiredFund: document.getElementById('requiredFund'),
    projectedFund: document.getElementById('projectedFund'),
    fundingGap: document.getElementById('fundingGap'),
    fundingRatio: document.getElementById('fundingRatio'),
    requiredMonthly: document.getElementById('requiredMonthly'),
    monthlyDelta: document.getElementById('monthlyDelta'),
    statusBanner: document.getElementById('statusBanner'),
    statusTitle: document.getElementById('statusTitle'),
    statusText: document.getElementById('statusText'),
    realReturnHint: document.getElementById('realReturnHint'),
    futureExpense: document.getElementById('futureExpense'),
    retirementYears: document.getElementById('retirementYears'),
    depletionAge: document.getElementById('depletionAge'),
    scenarioGrid: document.getElementById('scenarioGrid'),
    actionList: document.getElementById('actionList'),
    canvas: document.getElementById('fundChart'),
    chartEmpty: document.getElementById('chartEmpty'),
    chartSubtitle: document.getElementById('chartSubtitle'),
    themeBtn: document.getElementById('themeBtn'),
    resetBtn: document.getElementById('resetBtn'),
    printBtn: document.getElementById('printBtn')
  };

  const money = new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB', maximumFractionDigits: 0 });
  const number = new Intl.NumberFormat('th-TH', { maximumFractionDigits: 1 });

  function annualToMonthly(ratePct) {
    const rate = ratePct / 100;
    if (rate <= -1) return -1;
    return Math.pow(1 + rate, 1 / 12) - 1;
  }

  function parseInput(input, fallback = 0) {
    const value = Number(input.value);
    return Number.isFinite(value) ? value : fallback;
  }

  function readValues() {
    return Object.fromEntries(inputIds.map(id => [id, parseInput(inputs[id], defaults[id])]));
  }

  function validate(v) {
    const errors = [];
    if (v.currentAge < 18 || v.currentAge >= v.retireAge) errors.push('อายุเกษียณต้องมากกว่าอายุปัจจุบัน');
    if (v.lifeAge <= v.retireAge) errors.push('อายุที่วางแผนต้องมากกว่าอายุเกษียณ');
    if (v.retireAge - v.currentAge > 70) errors.push('ช่วงก่อนเกษียณยาวเกินขอบเขตของแบบจำลอง');
    if (v.lifeAge - v.retireAge > 70) errors.push('ช่วงหลังเกษียณยาวเกินขอบเขตของแบบจำลอง');
    return errors;
  }

  function projectToRetirement(v, monthlyContribution = v.monthlyContribution) {
    const months = Math.round((v.retireAge - v.currentAge) * 12);
    const monthlyReturn = annualToMonthly(v.preReturn);
    let balance = Math.max(0, v.currentSavings);
    let contribution = Math.max(0, monthlyContribution);

    for (let month = 0; month < months; month += 1) {
      balance = balance * (1 + monthlyReturn) + contribution;
      if ((month + 1) % 12 === 0) contribution *= 1 + Math.max(0, v.contributionGrowth) / 100;
    }
    return balance + Math.max(0, v.retirementLumpSum);
  }

  function growingAnnuityPV(firstPayment, annualReturnPct, annualGrowthPct, months) {
    if (firstPayment <= 0 || months <= 0) return 0;
    const r = annualToMonthly(annualReturnPct);
    const g = annualToMonthly(annualGrowthPct);
    if (Math.abs(r - g) < 1e-10) return firstPayment * months / (1 + r);
    return firstPayment * (1 - Math.pow((1 + g) / (1 + r), months)) / (r - g);
  }

  function calculate(v) {
    const yearsToRetirement = v.retireAge - v.currentAge;
    const retirementYears = v.lifeAge - v.retireAge;
    const monthsRetired = Math.round(retirementYears * 12);
    const inflationFactor = Math.pow(1 + v.inflation / 100, yearsToRetirement);
    const futureExpense = Math.max(0, v.monthlyExpense) * inflationFactor;
    const futurePension = Math.max(0, v.monthlyPension) * inflationFactor;
    const netMonthlyNeed = Math.max(0, futureExpense - futurePension);
    const baseRequired = growingAnnuityPV(netMonthlyNeed, v.postReturn, v.inflation, monthsRetired);
    const requiredFund = baseRequired * (1 + Math.max(0, v.safetyMargin) / 100);
    const projectedFund = projectToRetirement(v);
    const gap = projectedFund - requiredFund;
    const ratio = requiredFund > 0 ? projectedFund / requiredFund : 1;
    const requiredMonthly = findRequiredMonthly(v, requiredFund);

    return {
      yearsToRetirement,
      retirementYears,
      monthsRetired,
      inflationFactor,
      futureExpense,
      futurePension,
      netMonthlyNeed,
      baseRequired,
      requiredFund,
      projectedFund,
      gap,
      ratio,
      requiredMonthly
    };
  }

  function findRequiredMonthly(v, requiredFund) {
    if (requiredFund <= 0 || projectToRetirement(v, 0) >= requiredFund) return 0;
    let low = 0;
    let high = Math.max(10000, v.monthlyContribution || 0);
    let guard = 0;
    while (projectToRetirement(v, high) < requiredFund && guard < 40) {
      high *= 2;
      guard += 1;
    }
    if (guard >= 40) return Number.POSITIVE_INFINITY;

    for (let i = 0; i < 70; i += 1) {
      const mid = (low + high) / 2;
      if (projectToRetirement(v, mid) >= requiredFund) high = mid;
      else low = mid;
    }
    return high;
  }

  function buildPath(v, result) {
    const points = [{ age: v.currentAge, value: Math.max(0, v.currentSavings) }];
    const preMonthlyReturn = annualToMonthly(v.preReturn);
    const postMonthlyReturn = annualToMonthly(v.postReturn);
    const monthlyInflation = annualToMonthly(v.inflation);
    let balance = Math.max(0, v.currentSavings);
    let contribution = Math.max(0, v.monthlyContribution);
    let monthCounter = 0;

    for (let age = v.currentAge; age < v.retireAge; age += 1) {
      for (let m = 0; m < 12; m += 1) {
        balance = balance * (1 + preMonthlyReturn) + contribution;
        monthCounter += 1;
        if (monthCounter % 12 === 0) contribution *= 1 + Math.max(0, v.contributionGrowth) / 100;
      }
      points.push({ age: age + 1, value: balance });
    }

    balance += Math.max(0, v.retirementLumpSum);
    const retirementPoint = points.find(p => p.age === v.retireAge);
    if (retirementPoint) retirementPoint.value = balance;

    let withdrawal = result.netMonthlyNeed;
    let depletedAt = null;
    for (let age = v.retireAge; age < v.lifeAge; age += 1) {
      for (let m = 0; m < 12; m += 1) {
        balance = balance * (1 + postMonthlyReturn) - withdrawal;
        withdrawal *= 1 + monthlyInflation;
        if (balance <= 0 && depletedAt === null) {
          depletedAt = age + (m + 1) / 12;
          balance = 0;
        }
      }
      points.push({ age: age + 1, value: Math.max(0, balance) });
    }

    return { points, depletedAt };
  }

  function scenarioValues(v) {
    return [
      {
        name: 'ระมัดระวัง',
        tag: 'Stress',
        values: { ...v, preReturn: Math.max(-5, v.preReturn - 2), postReturn: Math.max(-5, v.postReturn - 2), inflation: v.inflation + 1 }
      },
      { name: 'กรณีฐาน', tag: 'Base', values: { ...v } },
      {
        name: 'ผลลัพธ์ดีกว่าคาด',
        tag: 'Upside',
        values: { ...v, preReturn: v.preReturn + 2, postReturn: v.postReturn + 1.5, inflation: Math.max(0, v.inflation - 0.5) }
      }
    ];
  }

  function renderScenarios(v) {
    els.scenarioGrid.innerHTML = scenarioValues(v).map(s => {
      const r = calculate(s.values);
      const state = r.ratio >= 1 ? 'good' : r.ratio >= 0.8 ? 'warn' : 'bad';
      const gapText = `${r.gap >= 0 ? 'เกินเป้า' : 'ขาด'} ${money.format(Math.abs(r.gap))}`;
      return `
        <article class="scenario-card">
          <header><h3>${s.name}</h3><span class="tag">${s.tag}</span></header>
          <strong class="${state}">${number.format(r.ratio * 100)}%</strong>
          <p>${gapText} เมื่อถึงอายุ ${s.values.retireAge} ปี</p>
          <div class="scenario-meta">
            <span>ก่อนเกษียณ<b>${number.format(s.values.preReturn)}%</b></span>
            <span>หลังเกษียณ<b>${number.format(s.values.postReturn)}%</b></span>
            <span>เงินเฟ้อ<b>${number.format(s.values.inflation)}%</b></span>
          </div>
        </article>`;
    }).join('');
  }

  function renderActions(v, r) {
    const actions = [];
    const contributionGap = Math.max(0, r.requiredMonthly - v.monthlyContribution);

    if (r.ratio >= 1.1) {
      actions.push({ title: 'มี Buffer ที่ใช้ได้จริง', text: `เงินคาดการณ์สูงกว่าเป้าประมาณ ${money.format(Math.max(0, r.gap))} ควรรักษาวินัยการออมและไม่เพิ่มความเสี่ยงโดยไม่จำเป็น` });
    } else if (r.ratio >= 1) {
      actions.push({ title: 'ผ่านเป้า แต่ยังบาง', text: 'แผนผ่านกรณีฐาน แต่ Buffer ยังไม่มาก ควรทดสอบกรณีผลตอบแทนต่ำและค่าใช้จ่ายสุขภาพสูงกว่าคาด' });
    } else {
      actions.push({ title: 'ปิดช่องว่างการออม', text: `เพิ่มเงินออมอีกราว ${money.format(contributionGap)} ต่อเดือน หรือปรับเป้าหมายอื่นร่วมกัน ไม่ควรหวังพึ่งผลตอบแทนสูงขึ้นเพียงอย่างเดียว` });
    }

    const realPostReturn = ((1 + v.postReturn / 100) / (1 + v.inflation / 100) - 1) * 100;
    if (realPostReturn < 1) {
      actions.push({ title: 'ผลตอบแทนจริงหลังเกษียณต่ำ', text: 'ผลตอบแทนหลังหักเงินเฟ้อมี Buffer น้อย แผนจึงไวต่อเงินเฟ้อและความผันผวน ควรลดรายจ่ายเป้าหมายหรือเพิ่มเงินก้อน' });
    } else {
      actions.push({ title: 'แยกพอร์ตสะสมกับพอร์ตใช้เงิน', text: 'ก่อนเกษียณเน้นการเติบโตได้มากกว่า แต่ช่วงใกล้เกษียณควรทยอยสร้างสินทรัพย์สภาพคล่องสำหรับรายจ่าย 2–3 ปีแรก' });
    }

    if (v.monthlyPension > 0) {
      actions.push({ title: 'ตรวจสอบรายได้หลังเกษียณ', text: 'บำนาญช่วยลดเงินก้อนที่ต้องมีอย่างมาก แต่ควรกรอกเฉพาะรายได้ที่มีความแน่นอนและหักภาษีหรือข้อจำกัดแล้ว' });
    } else {
      actions.push({ title: 'อย่ามองข้ามรายได้ประจำ', text: 'กรอกประกันสังคม บำนาญ ค่าเช่า หรือรายได้อื่นที่มีความแน่นอน เพื่อไม่ให้ประเมินเงินก้อนสูงเกินจริง' });
    }

    els.actionList.innerHTML = actions.slice(0, 3).map((a, i) => `
      <article class="action-item">
        <div class="number">0${i + 1}</div>
        <h3>${a.title}</h3>
        <p>${a.text}</p>
      </article>`).join('');
  }

  function updateStatus(r) {
    els.statusBanner.className = 'status-banner';
    if (r.ratio >= 1.1) {
      els.statusBanner.classList.add('good-state');
      els.statusTitle.textContent = 'แผนมีเงินสำรองเหนือเป้าหมาย';
      els.statusText.textContent = `คาดว่ามีเงินเกินเป้าประมาณ ${money.format(r.gap)} แต่ยังควรตรวจสอบกรณี Stress Test`;
    } else if (r.ratio >= 1) {
      els.statusBanner.classList.add('warn-state');
      els.statusTitle.textContent = 'แผนผ่านเป้าหมายแบบมี Buffer จำกัด';
      els.statusText.textContent = 'ผลลัพธ์กรณีฐานเพียงพอ แต่ความผิดพลาดเล็กน้อยของผลตอบแทน เงินเฟ้อ หรือค่าใช้จ่ายอาจทำให้ต่ำกว่าเป้า';
    } else if (r.ratio >= 0.8) {
      els.statusBanner.classList.add('warn-state');
      els.statusTitle.textContent = 'แผนยังขาดเงิน แต่แก้ได้ด้วยการปรับพฤติกรรม';
      els.statusText.textContent = `ส่วนขาดประมาณ ${money.format(Math.abs(r.gap))} ควรเพิ่มเงินออม ลดค่าใช้จ่ายเป้าหมาย หรือขยับอายุเกษียณร่วมกัน`;
    } else {
      els.statusBanner.classList.add('bad-state');
      els.statusTitle.textContent = 'ช่องว่างเงินเกษียณอยู่ในระดับสูง';
      els.statusText.textContent = `มีเงินรองรับเพียง ${number.format(r.ratio * 100)}% ของเป้าหมาย การหวังผลตอบแทนสูงขึ้นอย่างเดียวไม่เพียงพอ`;
    }
  }

  function roundedContribution(value) {
    if (!Number.isFinite(value)) return value;
    return Math.ceil(value / 100) * 100;
  }

  function setTone(element, state) {
    element.classList.remove('good', 'warn', 'bad');
    if (state) element.classList.add(state);
  }

  function render(v, r) {
    const gapState = r.ratio >= 1 ? 'good' : r.ratio >= 0.8 ? 'warn' : 'bad';
    const requiredMonthly = roundedContribution(r.requiredMonthly);
    const monthlyDiff = requiredMonthly - v.monthlyContribution;

    els.requiredFund.textContent = money.format(r.requiredFund);
    els.projectedFund.textContent = money.format(r.projectedFund);
    els.fundingGap.textContent = `${r.gap >= 0 ? '+' : '−'}${money.format(Math.abs(r.gap))}`;
    els.fundingRatio.textContent = `ครอบคลุม ${number.format(r.ratio * 100)}% ของเป้าหมาย`;
    els.requiredMonthly.textContent = Number.isFinite(requiredMonthly) ? money.format(requiredMonthly) : 'เกินขอบเขต';
    els.monthlyDelta.textContent = monthlyDiff > 0
      ? `มากกว่าที่ออมอยู่ ${money.format(monthlyDiff)}/เดือน`
      : monthlyDiff < 0
        ? `ต่ำกว่าที่ออมอยู่ ${money.format(Math.abs(monthlyDiff))}/เดือน`
        : 'เงินออมปัจจุบันตรงกับเป้าหมาย';

    setTone(els.fundingGap, gapState);
    setTone(els.requiredMonthly, monthlyDiff <= 0 ? 'good' : gapState);
    updateStatus(r);

    const realPre = ((1 + v.preReturn / 100) / (1 + v.inflation / 100) - 1) * 100;
    const realPost = ((1 + v.postReturn / 100) / (1 + v.inflation / 100) - 1) * 100;
    els.realReturnHint.textContent = `ผลตอบแทนจริงหลังหักเงินเฟ้อ: ก่อนเกษียณประมาณ ${number.format(realPre)}%/ปี และหลังเกษียณประมาณ ${number.format(realPost)}%/ปี`;
    els.futureExpense.textContent = `${money.format(r.futureExpense)}/เดือน`;
    els.retirementYears.textContent = `${number.format(r.retirementYears)} ปี`;
    els.chartSubtitle.textContent = `สะสมอีก ${number.format(r.yearsToRetirement)} ปี และใช้เงินหลังเกษียณ ${number.format(r.retirementYears)} ปี`;

    const path = buildPath(v, r);
    els.depletionAge.textContent = path.depletedAt ? `อายุ ${number.format(path.depletedAt)} ปี` : `ยังไม่หมดถึงอายุ ${number.format(v.lifeAge)} ปี`;
    setTone(els.depletionAge, path.depletedAt ? 'bad' : 'good');
    drawChart(path.points, v.retireAge, r.requiredFund);
    renderScenarios(v);
    renderActions(v, r);
  }

  function drawChart(points, retireAge, target) {
    const canvas = els.canvas;
    const ctx = canvas.getContext('2d');
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(320, rect.width || 900);
    const height = Math.max(260, rect.height || 390);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    if (!points.length) {
      els.chartEmpty.style.display = 'grid';
      return;
    }
    els.chartEmpty.style.display = 'none';

    const css = getComputedStyle(document.documentElement);
    const colors = {
      text: css.getPropertyValue('--muted').trim(),
      grid: css.getPropertyValue('--border').trim(),
      primary: css.getPropertyValue('--primary').trim(),
      target: css.getPropertyValue('--primary-2').trim(),
      fill: css.getPropertyValue('--primary').trim()
    };
    const pad = { left: 70, right: 22, top: 22, bottom: 42 };
    const plotW = width - pad.left - pad.right;
    const plotH = height - pad.top - pad.bottom;
    const minAge = points[0].age;
    const maxAge = points[points.length - 1].age;
    const maxValue = Math.max(target, ...points.map(p => p.value), 1) * 1.12;
    const x = age => pad.left + ((age - minAge) / Math.max(1, maxAge - minAge)) * plotW;
    const y = value => pad.top + plotH - (Math.max(0, value) / maxValue) * plotH;

    ctx.font = '12px Inter, sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.strokeStyle = colors.grid;
    ctx.fillStyle = colors.text;
    ctx.lineWidth = 1;

    for (let i = 0; i <= 4; i += 1) {
      const value = (maxValue / 4) * i;
      const py = y(value);
      ctx.beginPath();
      ctx.moveTo(pad.left, py);
      ctx.lineTo(width - pad.right, py);
      ctx.stroke();
      ctx.fillText(formatCompact(value), pad.left - 10, py);
    }

    ctx.textAlign = 'center';
    const ageStep = Math.max(5, Math.ceil((maxAge - minAge) / 8 / 5) * 5);
    for (let age = Math.ceil(minAge / ageStep) * ageStep; age <= maxAge; age += ageStep) {
      ctx.fillText(`${age}`, x(age), height - 17);
    }
    ctx.fillText('อายุ', width - pad.right, height - 17);

    const retireX = x(retireAge);
    ctx.save();
    ctx.setLineDash([6, 6]);
    ctx.strokeStyle = colors.target;
    ctx.beginPath();
    ctx.moveTo(retireX, pad.top);
    ctx.lineTo(retireX, pad.top + plotH);
    ctx.stroke();
    ctx.restore();
    ctx.fillStyle = colors.target;
    ctx.textAlign = 'center';
    ctx.fillText(`เกษียณ ${retireAge}`, retireX, pad.top + 8);

    const gradient = ctx.createLinearGradient(0, pad.top, 0, pad.top + plotH);
    gradient.addColorStop(0, colorWithAlpha(colors.fill, 0.32));
    gradient.addColorStop(1, colorWithAlpha(colors.fill, 0.02));
    ctx.beginPath();
    points.forEach((p, i) => {
      if (i === 0) ctx.moveTo(x(p.age), y(p.value));
      else ctx.lineTo(x(p.age), y(p.value));
    });
    ctx.lineTo(x(points[points.length - 1].age), y(0));
    ctx.lineTo(x(points[0].age), y(0));
    ctx.closePath();
    ctx.fillStyle = gradient;
    ctx.fill();

    ctx.beginPath();
    points.forEach((p, i) => {
      if (i === 0) ctx.moveTo(x(p.age), y(p.value));
      else ctx.lineTo(x(p.age), y(p.value));
    });
    ctx.strokeStyle = colors.primary;
    ctx.lineWidth = 3;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.stroke();

    const retirementPoint = points.find(p => p.age === retireAge);
    if (retirementPoint) {
      ctx.beginPath();
      ctx.arc(x(retirementPoint.age), y(retirementPoint.value), 5, 0, Math.PI * 2);
      ctx.fillStyle = colors.primary;
      ctx.fill();
    }
  }

  function colorWithAlpha(color, alpha) {
    const hex = color.trim();
    if (/^#[0-9a-f]{6}$/i.test(hex)) {
      const r = parseInt(hex.slice(1, 3), 16);
      const g = parseInt(hex.slice(3, 5), 16);
      const b = parseInt(hex.slice(5, 7), 16);
      return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }
    return color;
  }

  function formatCompact(value) {
    if (value >= 1e9) return `${number.format(value / 1e9)} พันล.`;
    if (value >= 1e6) return `${number.format(value / 1e6)} ล.`;
    if (value >= 1e3) return `${number.format(value / 1e3)}k`;
    return number.format(value);
  }

  function showValidation(errors) {
    els.statusBanner.className = 'status-banner bad-state';
    els.statusTitle.textContent = 'ข้อมูลช่วงอายุไม่ถูกต้อง';
    els.statusText.textContent = errors.join(' • ');
    ['requiredFund', 'projectedFund', 'fundingGap', 'requiredMonthly'].forEach(key => { els[key].textContent = '—'; });
    els.fundingRatio.textContent = '—';
    els.monthlyDelta.textContent = '—';
    els.scenarioGrid.innerHTML = '';
    els.actionList.innerHTML = '';
    els.chartEmpty.style.display = 'grid';
    const ctx = els.canvas.getContext('2d');
    ctx.clearRect(0, 0, els.canvas.width, els.canvas.height);
  }

  function save(values) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(values)); } catch (_) { /* storage unavailable */ }
  }

  function load() {
    let values = { ...defaults };
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (saved && typeof saved === 'object') values = { ...values, ...saved };
    } catch (_) { /* invalid saved data */ }
    inputIds.forEach(id => { inputs[id].value = values[id]; });
  }

  function recalculate() {
    const v = readValues();
    save(v);
    const errors = validate(v);
    if (errors.length) {
      showValidation(errors);
      return;
    }
    const r = calculate(v);
    render(v, r);
  }

  function setTheme(theme) {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('retireplan-theme', theme);
    els.themeBtn.textContent = theme === 'dark' ? '☀️ Light' : '🌙 Dark';
    requestAnimationFrame(recalculate);
  }

  let resizeTimer = null;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(recalculate, 120);
  });

  inputIds.forEach(id => inputs[id].addEventListener('input', recalculate));
  els.resetBtn.addEventListener('click', () => {
    inputIds.forEach(id => { inputs[id].value = defaults[id]; });
    recalculate();
  });
  els.themeBtn.addEventListener('click', () => setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'));
  els.printBtn.addEventListener('click', () => window.print());

  load();
  setTheme(document.documentElement.dataset.theme || 'dark');
})();
