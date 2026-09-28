// Executes a Jarvis proposed action once the user has confirmed it.
// Jarvis works with human-readable names (a loan's contact_name, an income
// plan's name) since that's what it can see in the context summary and
// what's natural to say out loud — this module resolves those names back
// to real records before calling the actual db.js/finance-actions logic,
// and throws a clear error if a name doesn't match anything (rather than
// silently doing nothing or guessing).

import { getWallets, getLoans, getIncomePlans, getSetting, setSetting, getProjects, getHackathons, saveProject, deleteProject, saveHackathon, deleteHackathon, getStartups, saveStartup, deleteStartup, getCertificates, saveCertificate, deleteCertificate, getResearch, saveResearch, deleteResearch, getTransactions } from './db';
import { toggleIncomeReceived, settleLoan } from './finance-actions';
import { todayISO } from './utils';

function findByNameLoose(list, field, needle) {
  const target = needle.trim().toLowerCase();
  return (
    list.find((item) => (item[field] || '').trim().toLowerCase() === target) ||
    list.find((item) => (item[field] || '').trim().toLowerCase().includes(target))
  );
}

// ctx: { addTransaction, removeTransaction, updateLoan, updateIncomePlan,
//        currency, saveFoodLog } — the AppContext functions the caller
// (components/JarvisWidget.js) already has via useApp().
export async function executeProposedAction(action, ctx) {
  const { tool, args } = action;
  const wallets = await getWallets();

  switch (tool) {
    case 'propose_transaction': {
      const wallet = args.wallet_name
        ? findByNameLoose(wallets, 'name', args.wallet_name) || wallets[0]
        : wallets[0];
      if (!wallet) throw new Error('No wallet exists to record this against — add one first.');
      return ctx.addTransaction({
        type: args.type,
        amount: Number(args.amount),
        wallet_id: wallet.id,
        category: args.category || 'other',
        description: args.description || '',
        date: todayISO(),
        currency: ctx.currency,
      });
    }

    case 'propose_settle_loan': {
      const loans = await getLoans();
      const loan = findByNameLoose(loans.filter((l) => l.status === 'active'), 'contact_name', args.contact_name);
      if (!loan) throw new Error(`Couldn't find an active loan with "${args.contact_name}".`);
      return settleLoan(loan, { wallets, currency: ctx.currency, addTransaction: ctx.addTransaction, updateLoan: ctx.updateLoan });
    }

    case 'propose_mark_income_received': {
      const plans = await getIncomePlans();
      const plan = findByNameLoose(plans.filter((p) => !p.is_received), 'name', args.name);
      if (!plan) throw new Error(`Couldn't find a pending income plan named "${args.name}".`);
      return toggleIncomeReceived(plan, { wallets, currency: ctx.currency, addTransaction: ctx.addTransaction, removeTransaction: ctx.removeTransaction, updateIncomePlan: ctx.updateIncomePlan });
    }

    case 'propose_log_meal': {
      return ctx.saveFoodLog({
        id: ctx.genId(),
        date: todayISO(),
        created_at: new Date().toISOString(),
        slot: args.slot,
        name: args.name,
        cal: Number(args.cal) || 0,
        protein: Number(args.protein) || 0,
      });
    }

    case 'propose_planner_block_edit': {
      const overrides = await getSetting(`planner_overrides_${todayISO()}`, {});
      const patch = {};
      if (args.new_time) patch.time = args.new_time;
      if (args.new_note) patch.note = args.new_note;
      const next = { ...overrides, [args.block_id]: { ...(overrides[args.block_id] || {}), ...patch } };
      await setSetting(`planner_overrides_${todayISO()}`, next);
      return next;
    }

    case 'propose_update_project_status': {
      const projects = await getProjects();
      const project = findByNameLoose(projects, 'name', args.project_name);
      if (!project) throw new Error(`Couldn't find a project named "${args.project_name}".`);
      const patch = {};
      if (args.status) patch.status = args.status;
      if (args.progress != null) patch.progress = Number(args.progress);
      if (args.importance != null) patch.importance = Math.max(0, Math.min(100, Number(args.importance)));
      return saveProject({ ...project, ...patch });
    }

    case 'propose_create_hackathon': {
      const record = { ...args, status: args.status || 'active' };
      return saveHackathon(record);
    }
    case 'propose_delete_hackathon': {
      const hacks = await getHackathons();
      const hack = findByNameLoose(hacks, 'name', args.hackathon_name);
      if (!hack) throw new Error(`Couldn't find a hackathon named "${args.hackathon_name}".`);
      await deleteHackathon(hack.id);
      return hack;
    }

    case 'propose_create_startup': {
      return saveStartup({ ...args, stages: args.stages || {} });
    }
    case 'propose_update_startup': {
      const startups = await getStartups();
      const startup = findByNameLoose(startups, 'name', args.startup_name);
      if (!startup) throw new Error(`Couldn't find a startup named "${args.startup_name}".`);
      const patch = {};
      ['description','accelerator','stages'].forEach((k) => { if (args[k] !== undefined) patch[k] = args[k]; });
      return saveStartup({ ...startup, ...patch });
    }
    case 'propose_delete_startup': {
      const startups = await getStartups();
      const startup = findByNameLoose(startups, 'name', args.startup_name);
      if (!startup) throw new Error(`Couldn't find a startup named "${args.startup_name}".`);
      await deleteStartup(startup.id);
      return startup;
    }

    case 'propose_create_project': {
      return saveProject(args);
    }
    case 'propose_delete_project': {
      const projects = await getProjects();
      const project = findByNameLoose(projects, 'name', args.project_name);
      if (!project) throw new Error(`Couldn't find a project named "${args.project_name}".`);
      await deleteProject(project.id);
      return project;
    }

    case 'propose_create_certificate': {
      return saveCertificate(args);
    }
    case 'propose_delete_certificate': {
      const certs = await getCertificates();
      const cert = findByNameLoose(certs, 'title', args.title);
      if (!cert) throw new Error(`Couldn't find a certificate named "${args.title}".`);
      await deleteCertificate(cert.id);
      return cert;
    }

    case 'propose_create_research': {
      return saveResearch(args);
    }
    case 'propose_delete_research': {
      const items = await getResearch();
      const item = findByNameLoose(items, 'title', args.title);
      if (!item) throw new Error(`Couldn't find a research item named "${args.title}".`);
      await deleteResearch(item.id);
      return item;
    }

    case 'propose_delete_transaction': {
      const txs = await getTransactions();
      const matches = txs.filter((t) => args.transaction_id ? t.id === args.transaction_id : false);
      if (!matches.length) throw new Error('Could not identify that transaction. Use the transaction id shown in context.');
      await ctx.removeTransaction(matches[0].id);
      return matches[0];
    }

    case 'propose_update_hackathon_status': {
      const hackathons = await getHackathons();
      const hack = findByNameLoose(hackathons, 'name', args.hackathon_name);
      if (!hack) throw new Error(`Couldn't find a hackathon named "${args.hackathon_name}".`);
      return saveHackathon({ ...hack, status: args.status });
    }

    case 'propose_add_planner_activity': {
      const overrides = await getSetting(`planner_overrides_${todayISO()}`, {});
      const newBlockId = `jarvis_${Date.now()}`;
      // pages/planner.js's merge logic recognizes override entries whose id
      // doesn't match any generated block as brand-new standalone blocks
      // (not just patches to existing ones), so storing this here is
      // enough for it to actually appear in the schedule.
      const next = {
        ...overrides,
        [newBlockId]: {
          id: newBlockId,
          time: args.time,
          label: args.label,
          type: 'personal',
          duration: Number(args.duration),
          emoji: '✨',
          note: args.note || (args.estimated_cost ? `Estimated cost: ${args.estimated_cost}` : ''),
          _jarvisAdded: true,
        },
      };
      await setSetting(`planner_overrides_${todayISO()}`, next);
      return next[newBlockId];
    }

    default:
      throw new Error(`Unknown action: ${tool}`);
  }
}

// Human-readable description shown in the confirmation card, so the user
// sees plain English rather than raw tool/argument names before approving.
export function describeProposedAction(action) {
  const { tool, args } = action;
  switch (tool) {
    case 'propose_transaction':
      return `${args.type === 'income' ? 'Add income' : 'Add expense'}: ${args.amount} (${args.category})${args.description ? ` — ${args.description}` : ''}${args.wallet_name ? ` from ${args.wallet_name}` : ''}`;
    case 'propose_settle_loan':
      return `Mark loan with ${args.contact_name} as settled`;
    case 'propose_mark_income_received':
      return `Mark income plan "${args.name}" as received`;
    case 'propose_log_meal':
      return `Log ${args.slot}: ${args.name} (${args.cal} cal${args.protein ? `, ${args.protein}g protein` : ''})`;
    case 'propose_planner_block_edit':
      return `Edit today's plan: ${args.new_time ? `move to ${args.new_time}` : ''}${args.new_note ? ` note: "${args.new_note}"` : ''}`;
    case 'propose_update_project_status':
      return `Update project "${args.project_name}"${args.status ? ` to ${args.status}` : ''}${args.progress != null ? ` (${args.progress}% done)` : ''}${args.importance != null ? ` — importance ${args.importance}%` : ''}`;
    case 'propose_create_hackathon':
      return `Add hackathon "${args.name}"${args.deadline ? ` — deadline ${args.deadline}` : ''}`;
    case 'propose_delete_hackathon':
      return `Delete hackathon "${args.hackathon_name}"`;
    case 'propose_create_startup':
      return `Add startup "${args.name}"`;
    case 'propose_update_startup':
      return `Update startup "${args.startup_name}"`;
    case 'propose_delete_startup':
      return `Delete startup "${args.startup_name}"`;
    case 'propose_create_project':
      return `Add project "${args.name}"`;
    case 'propose_delete_project':
      return `Delete project "${args.project_name}"`;
    case 'propose_create_certificate':
      return `Add certificate "${args.title}"`;
    case 'propose_delete_certificate':
      return `Delete certificate "${args.title}"`;
    case 'propose_create_research':
      return `Add research "${args.title}"`;
    case 'propose_delete_research':
      return `Delete research "${args.title}"`;
    case 'propose_delete_transaction':
      return `Delete the selected transaction`;
    case 'propose_update_hackathon_status':
      return `Mark hackathon "${args.hackathon_name}" as ${args.status}`;
    case 'propose_add_planner_activity':
      return `Add "${args.label}" to today's plan at ${args.time} (${args.duration} min)${args.estimated_cost ? `, ~${args.estimated_cost}` : ''}`;
    default:
      return tool;
  }
}
