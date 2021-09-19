#!/usr/bin/env node

const core = require("@actions/core");
const { context, GitHub } = require("@actions/github");
const checkOutstandingTasks = require("./src/check-outstanding-tasks");

async function run() {
  const trigger = core.getInput("trigger", { required: true });

  const reaction = core.getInput("reaction");
  const { GITHUB_TOKEN } = process.env;
  if (reaction && !GITHUB_TOKEN) {
    core.setFailed('If "reaction" is supplied, GITHUB_TOKEN is required');
    return;
  }
  const client = new GitHub(GITHUB_TOKEN);

  // lookup the pr
  let pr = context.payload.pull_request;

  // console.log("Context: " + JSON.stringify(context));

  // check if this is an issue rather than pull event
  if (context.event === "issue_comment" && !pr) {
    // if so we need to make sure this is for a PR only
    if (!context.payload.issue.pull_request) {
      return;
    }
    console.log("Issue: " + JSON.stringify(context.payload.issue));
    // & lookup the PR it's for to continue
    let response = await context.github.pulls.get(
      context.repo({
        pull_number: context.payload.issue.number
      })
    );
    pr = response.data;
  }

  // console.log("client: " + JSON.stringify(client));
  console.log("PR: " + JSON.stringify(pr));

  let comments = await client.issues.listComments({
    issue_number: pr.number,
    owner: context.repo.owner,
    repo: context.repo.repo
  });

  let outstandingTasks = { total: 0, remaining: 0 };

  console.log("Comments: " + JSON.stringify(comments.data));

  if (comments.data.length) {
    comments.data.forEach(function(comment) {
      if (comment.body.includes("- [ ] ")) {
        //Won't actually tell us when there's multiple tasks on a comment
        outstandingTasks.remaining += 1;
      }
      // let commentOutstandingTasks = checkOutstandingTasks(comment.body);
      // outstandingTasks.total += commentOutstandingTasks.total;
      // outstandingTasks.remaining += commentOutstandingTasks.remaining;
    });
  }

  console.log("outstanding: " + JSON.stringify(outstandingTasks));

  if (outstandingTasks.remaining > 0) {
    core.setFailed('One or more comments still need to be checked.');
    return;
  }

  if (
    context.eventName === "issue_comment" &&
    !context.payload.issue.pull_request
  ) {
    // not a pull-request comment, aborting
    core.setOutput("triggered", "false");
    return;
  }

  const { owner, repo } = context.repo;

  core.setOutput("triggered", "true");

  if (!reaction) {
    return;
  }

  let check = {
    name: 'task-list-completed',
    head_sha: pr.head.sha,
    started_at: startTime,
    status: 'in_progress',
    output: {
      title: (outstandingTasks.total - outstandingTasks.remaining) + ' / ' + outstandingTasks.total + ' tasks completed',
      summary: outstandingTasks.remaining + ' task' + (outstandingTasks.remaining > 1 ? 's' : '') + ' still to be completed',
      text: 'We check if any task lists need completing before you can merge this PR'
    }
  };

  // all finished?
  if (outstandingTasks.remaining === 0) {
    check.status = 'completed';
    check.conclusion = 'success';
    check.completed_at = (new Date).toISOString();
    check.output.summary = 'All tasks have been completed';
  };

  // send check back to GitHub
  return context.github.checks.create(context.repo(check));
}

run().catch(err => {
  console.error(err);
  core.setFailed("Unexpected error");
});
