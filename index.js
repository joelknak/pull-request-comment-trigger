#!/usr/bin/env node

const core = require("@actions/core");
const { context, GitHub } = require("@actions/github");
const checkOutstandingTasks = require("./src/check-outstanding-tasks");

async function getPR(context, client) {
  let pr = context.payload.pull_request;

  if (context.eventName === "issue_comment" && !pr) {
    let response = await client.pulls.get({
      pull_number: context.payload.issue.number,
      owner: context.repo.owner,
      repo: context.repo.repo
    });
    pr = response.data;
  }
  return pr;
}

async function run() {
  const { GITHUB_TOKEN } = process.env;
  const client = new GitHub(GITHUB_TOKEN);

  const pr = await getPR(context, client);

  let comments = await client.issues.listComments({
    issue_number: pr.number,
    owner: context.repo.owner,
    repo: context.repo.repo
  });

  let outstandingTasks = { total: 0, remaining: 0 };

  let outstandingTaskExists = false;

  if (comments.data.length) {
    comments.data.forEach(function(comment) {
      if (comment.body.includes("- [ ] ")) {
        outstandingTaskExists = true;
      }
    });
  }

  const { owner, repo } = context.repo;

  core.setOutput("triggered", "true");

  const startTime = new Date().toISOString();

  let check = {
    name: "knak-workflow",
    head_sha: pr.head.sha,
    started_at: startTime,
    status: "completed",
    conclusion: "action_required",
    output: {
      title:
      "One or more tasks need to be checked off",
      summary:
      "Please check the comments in the PR for any tasks that have not been checked off",
      text:
        "We check if any task lists need completing before you can merge this PR"
    }
  };

  // all finished?
  if (outstandingTasks.remaining === 0) {
    check.status = "completed";
    check.conclusion = "success";
    check.completed_at = new Date().toISOString();
    check.output.summary = "All tasks have been completed";
  }

  // send check back to GitHub
  return client.checks.create({
    owner: context.repo.owner,
    repo: context.repo.repo,
    ...check
  });
}

run().catch(err => {
  console.error(err);
  core.setFailed("Unexpected error");
});

// const reaction = core.getInput("reaction");
// if (reaction && !GITHUB_TOKEN) {
//   core.setFailed('If "reaction" is supplied, GITHUB_TOKEN is required');
//   return;
// }

// const trigger = core.getInput("trigger", { required: true });

// console.log("outstanding: " + JSON.stringify(outstandingTasks));

// if (outstandingTasks.remaining > 0) {
// core.setFailed("One or more comments still need to be checked.");
// return;
// }

// if (
//   context.eventName === "issue_comment" &&
//   !context.payload.issue.pull_request
// ) {
//   // not a pull-request comment, aborting
//   core.setOutput("triggered", "false");
//   return;
// }
