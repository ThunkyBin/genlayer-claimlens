import { createClient } from 'genlayer-js';
import { testnetBradbury, testnetAsimov, studionet } from 'genlayer-js/chains';
import { ExecutionResult, TransactionStatus } from 'genlayer-js/types';
import './style.css';

const networkTable = {
  bradbury: { label: 'Bradbury testnet', chain: testnetBradbury, sdkName: 'testnetBradbury', explorer: 'https://explorer-bradbury.genlayer.com' },
  asimov: { label: 'Asimov testnet', chain: testnetAsimov, sdkName: 'testnetAsimov', explorer: 'https://explorer-asimov.genlayer.com' },
  studionet: { label: 'Studionet', chain: studionet, sdkName: 'studionet', explorer: 'https://explorer-studio.genlayer.com' },
};
const READ_ONLY_CALLER = '0x0000000000000000000000000000000000000000';

const el = (selector) => document.querySelector(selector);
const networkSelect = el('#network');
const connectButton = el('#connect-wallet');
const walletStatus = el('#wallet-status');
const contractInput = el('#contract-address');
const submitButton = el('#submit-review');
const activity = el('#activity');
const resultEmpty = el('#result-empty');
const resultContent = el('#result-content');
const loadLatestButton = el('#load-latest');
const assessmentHistory = el('#assessment-history');
const assessmentPosition = el('#assessment-position');
const assessmentIdInput = el('#assessment-id-input');
const previousAssessmentButton = el('#previous-assessment');
const loadAssessmentButton = el('#load-assessment');
const nextAssessmentButton = el('#next-assessment');
const claimInput = el('#claim');
const source3Wrap = el('#source-3-wrap');

let activeAccount = '';
let activeClient;
let activeNetworkKey = networkSelect.value;
let storedAssessmentCount = null;
let activeAssessmentId = null;

const persistedAddress = localStorage.getItem('claimlens.contractAddress');
const persistedNetwork = localStorage.getItem('claimlens.network');
if (persistedNetwork && networkTable[persistedNetwork]) {
  activeNetworkKey = persistedNetwork;
  networkSelect.value = persistedNetwork;
}
if (persistedAddress) contractInput.value = persistedAddress;

function setActivity(message, isError = false) {
  activity.replaceChildren();
  activity.classList.toggle('error', isError);
  activity.textContent = message;
}

function getContractAddress() {
  const address = contractInput.value.trim();
  return /^0x[a-fA-F0-9]{40}$/.test(address) ? address : '';
}

function getSources() {
  return ['#source-1', '#source-2', '#source-3']
    .map((selector) => el(selector).value.trim())
    .filter(Boolean);
}

function updateFormState() {
  const validClaim = claimInput.value.trim().length > 0 && claimInput.value.trim().length <= 280;
  const sources = getSources();
  const validSources = sources.length >= 2 && sources.length <= 3
    && sources.every((url) => {
      try { return new URL(url).protocol === 'https:'; } catch { return false; }
    })
    && new Set(sources).size === sources.length;
  const canReview = Boolean(activeAccount && getContractAddress() && validClaim && validSources);
  submitButton.disabled = !canReview;
  el('#claim-count').textContent = `${claimInput.value.length} / 280`;
}

function getReadClient() {
  return createClient({
    chain: networkTable[activeNetworkKey].chain,
    account: activeAccount || READ_ONLY_CALLER,
  });
}

async function connectWallet() {
  const provider = window.okxwallet || window.ethereum;
  if (!provider?.request) {
    setActivity('No compatible browser wallet was found. Install or enable a wallet that supports EIP-1193, then reload this page.', true);
    return;
  }
  connectButton.disabled = true;
  setActivity(`Requesting wallet access for ${networkTable[activeNetworkKey].label}…`);
  try {
    const accounts = await provider.request({ method: 'eth_requestAccounts' });
    if (!Array.isArray(accounts) || !accounts[0]) throw new Error('The wallet did not return an account.');
    const network = networkTable[activeNetworkKey];
    activeAccount = accounts[0];
    activeClient = createClient({ chain: network.chain, account: activeAccount, provider });
    await activeClient.connect(network.sdkName);
    walletStatus.textContent = `${activeAccount.slice(0, 6)}…${activeAccount.slice(-4)} · ${network.label}`;
    connectButton.innerHTML = 'Wallet connected <span aria-hidden="true">✓</span>';
    setActivity('Wallet connected. Add a deployed ClaimLens contract address to read or submit reviews.');
  } catch (error) {
    activeAccount = '';
    activeClient = undefined;
    walletStatus.textContent = 'Wallet not connected';
    setActivity(error instanceof Error ? error.message : 'Could not connect the wallet.', true);
  } finally {
    connectButton.disabled = false;
    updateFormState();
    await refreshContractSummary();
  }
}

async function refreshContractSummary() {
  const address = getContractAddress();
  storedAssessmentCount = null;
  activeAssessmentId = null;
  updateAssessmentHistory();
  if (!address) {
    el('#assessment-count').textContent = '—';
    loadLatestButton.disabled = true;
    storedAssessmentCount = null;
    activeAssessmentId = null;
    resultContent.hidden = true;
    resultEmpty.hidden = false;
    updateAssessmentHistory();
    return;
  }
  try {
    const count = await getReadClient().readContract({ address, functionName: 'get_assessment_count', args: [] });
    const parsedCount = BigInt(String(count));
    storedAssessmentCount = parsedCount;
    el('#assessment-count').textContent = parsedCount.toString();
    loadLatestButton.disabled = parsedCount === 0n;
    if (parsedCount > 0n) {
      resultEmpty.hidden = true;
      resultContent.hidden = false;
      await loadAssessment(parsedCount - 1n);
    } else {
      activeAssessmentId = null;
      resultContent.hidden = true;
      resultEmpty.hidden = false;
      updateAssessmentHistory();
      setActivity('Connected to ClaimLens. No assessments have been stored yet.');
    }
  } catch (error) {
    storedAssessmentCount = null;
    activeAssessmentId = null;
    el('#assessment-count').textContent = '—';
    loadLatestButton.disabled = true;
    resultContent.hidden = true;
    resultEmpty.hidden = false;
    updateAssessmentHistory();
    setActivity(error instanceof Error ? `Could not read this contract: ${error.message}` : 'Could not read this contract.', true);
  }
}

async function loadAssessment(id) {
  const address = getContractAddress();
  if (!address) return;
  try {
    const assessmentId = BigInt(String(id));
    if (storedAssessmentCount === null || assessmentId < 0n || assessmentId >= storedAssessmentCount) {
      throw new Error('Choose an assessment ID between 0 and the latest stored ID.');
    }
    setActivity(`Reading assessment ${assessmentId.toString()} from ${networkTable[activeNetworkKey].label}…`);
    const raw = await getReadClient().readContract({ address, functionName: 'get_assessment', args: [assessmentId] });
    const record = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!record || typeof record !== 'object' || !record.verdict) throw new Error('No completed assessment was returned.');
    showAssessment(record, assessmentId);
    setActivity('Assessment loaded from the contract.');
  } catch (error) {
    setActivity(error instanceof Error ? error.message : 'Could not load the assessment.', true);
  }
}

function showAssessment(record, id) {
  resultEmpty.hidden = true;
  resultContent.hidden = false;
  const verdict = String(record.verdict || 'INSUFFICIENT').toUpperCase();
  const verdictNode = el('#verdict');
  verdictNode.textContent = verdict;
  verdictNode.className = `verdict-pill ${verdict.toLowerCase()}`;
  el('#assessment-id').textContent = `ASSESSMENT ${id.toString()}`;
  el('#result-claim').textContent = record.claim || 'Claim text unavailable.';
  el('#rationale').textContent = record.rationale || 'No rationale was stored.';
  el('#sources-used').textContent = `${record.sources_used ?? record.sources?.length ?? 0} sources reviewed`;
  activeAssessmentId = BigInt(String(id));
  assessmentIdInput.value = activeAssessmentId.toString();
  updateAssessmentHistory();
  const sources = el('#result-sources');
  sources.replaceChildren();
  for (const url of (Array.isArray(record.sources) ? record.sources : [])) {
    let safeUrl;
    try {
      safeUrl = new URL(String(url));
    } catch {
      continue;
    }
    if (safeUrl.protocol !== 'https:') continue;
    const link = document.createElement('a');
    link.className = 'result-source';
    link.href = safeUrl.href;
    link.target = '_blank';
    link.rel = 'noreferrer';
    link.textContent = url;
    sources.append(link);
  }
}

function updateAssessmentHistory() {
  const hasHistory = storedAssessmentCount !== null && storedAssessmentCount > 1n;
  assessmentHistory.hidden = !hasHistory;
  if (!hasHistory) {
    assessmentPosition.textContent = '';
    previousAssessmentButton.disabled = true;
    loadAssessmentButton.disabled = true;
    nextAssessmentButton.disabled = true;
    return;
  }

  assessmentPosition.textContent = activeAssessmentId === null
    ? `${storedAssessmentCount.toString()} stored`
    : `Assessment ${(activeAssessmentId + 1n).toString()} of ${storedAssessmentCount.toString()} · ID ${activeAssessmentId.toString()}`;
  previousAssessmentButton.disabled = activeAssessmentId === null || activeAssessmentId === 0n;
  nextAssessmentButton.disabled = activeAssessmentId === null || activeAssessmentId >= storedAssessmentCount - 1n;
  const requestedId = assessmentIdInput.value.trim();
  const validId = /^\d{1,78}$/.test(requestedId)
    && BigInt(requestedId) < storedAssessmentCount;
  loadAssessmentButton.disabled = !validId;
}

async function submitReview(event) {
  event.preventDefault();
  const address = getContractAddress();
  if (!activeClient || !address) return;
  const write = {
    address,
    functionName: 'assess',
    args: [claimInput.value.trim(), getSources().join('\n')],
    value: 0n,
  };
  const confirmed = window.confirm('This submits a state-changing GenLayer transaction. Your wallet will show the network fee before you approve it. Continue to the wallet request?');
  if (!confirmed) return;
  submitButton.disabled = true;
  setActivity('Submitting to the wallet… approve only if the displayed network and fee are expected.');
  let transactionHash;
  try {
    transactionHash = await activeClient.writeContract(write);
    const link = document.createElement('a');
    link.href = `${networkTable[activeNetworkKey].explorer}/tx/${transactionHash}`;
    link.target = '_blank';
    link.rel = 'noreferrer';
    link.textContent = `Track transaction ${transactionHash.slice(0, 10)}…`;
    activity.replaceChildren(document.createTextNode('Transaction submitted. Waiting for finalization. '), link);
    const transaction = await activeClient.waitForTransactionReceipt({
      hash: transactionHash,
      status: TransactionStatus.FINALIZED,
    });
    if (transaction.txExecutionResultName !== ExecutionResult.FINISHED_WITH_RETURN) {
      throw new Error(`Transaction finalized without a successful contract result (${transaction.statusName} / ${transaction.txExecutionResultName}). Inspect the receipt before retrying.`);
    }
    setActivity(`Review recorded. ${transactionHash}`);
    await refreshContractSummary();
  } catch (error) {
    const prefix = transactionHash ? 'A transaction hash exists; do not submit the same review again until its receipt is checked. ' : 'No transaction hash was returned. ';
    setActivity(`${prefix}${error instanceof Error ? error.message : 'The wallet or network request failed.'}`, true);
    if (transactionHash) {
      const link = document.createElement('a');
      link.href = `${networkTable[activeNetworkKey].explorer}/tx/${transactionHash}`;
      link.target = '_blank';
      link.rel = 'noreferrer';
      link.textContent = 'Inspect transaction receipt';
      activity.append(document.createTextNode(' '), link);
    }
  } finally {
    submitButton.disabled = false;
    updateFormState();
  }
}

connectButton.addEventListener('click', connectWallet);
claimInput.addEventListener('input', updateFormState);
contractInput.addEventListener('input', () => {
  const address = getContractAddress();
  if (address) localStorage.setItem('claimlens.contractAddress', address);
  else localStorage.removeItem('claimlens.contractAddress');
  updateFormState();
  refreshContractSummary();
});
for (const selector of ['#source-1', '#source-2', '#source-3']) {
  el(selector).addEventListener('input', updateFormState);
}
networkSelect.addEventListener('change', async () => {
  activeNetworkKey = networkSelect.value;
  localStorage.setItem('claimlens.network', activeNetworkKey);
  if (activeAccount) await connectWallet();
  else {
    walletStatus.textContent = `Wallet not connected · ${networkTable[activeNetworkKey].label}`;
    await refreshContractSummary();
  }
  updateFormState();
});
el('#add-source').addEventListener('click', () => {
  source3Wrap.hidden = false;
  el('#add-source').hidden = true;
  el('#source-3').focus();
});
el('#remove-source').addEventListener('click', () => {
  el('#source-3').value = '';
  source3Wrap.hidden = true;
  el('#add-source').hidden = false;
  updateFormState();
});
el('#review-form').addEventListener('submit', submitReview);
loadLatestButton.addEventListener('click', async () => {
  try {
    const count = BigInt(String(await getReadClient().readContract({ address: getContractAddress(), functionName: 'get_assessment_count', args: [] })));
    if (count > 0n) await loadAssessment(count - 1n);
  } catch (error) {
    setActivity(error instanceof Error ? error.message : 'Could not load the latest assessment.', true);
  }
});
assessmentIdInput.addEventListener('input', updateAssessmentHistory);
assessmentIdInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !loadAssessmentButton.disabled) {
    event.preventDefault();
    loadAssessmentButton.click();
  }
});
loadAssessmentButton.addEventListener('click', () => {
  const requestedId = assessmentIdInput.value.trim();
  if (/^\d{1,78}$/.test(requestedId)) void loadAssessment(BigInt(requestedId));
});
previousAssessmentButton.addEventListener('click', () => {
  if (activeAssessmentId !== null && activeAssessmentId > 0n) {
    void loadAssessment(activeAssessmentId - 1n);
  }
});
nextAssessmentButton.addEventListener('click', () => {
  if (activeAssessmentId !== null && storedAssessmentCount !== null
      && activeAssessmentId < storedAssessmentCount - 1n) {
    void loadAssessment(activeAssessmentId + 1n);
  }
});

if (activeAccount) walletStatus.textContent = `${activeAccount.slice(0, 6)}…${activeAccount.slice(-4)}`;
else walletStatus.textContent = `Wallet not connected · ${networkTable[activeNetworkKey].label}`;
updateFormState();
updateAssessmentHistory();
refreshContractSummary();
