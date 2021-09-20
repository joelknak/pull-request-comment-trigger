#!/usr/bin/env node

const core = require("@actions/core");
const { context, GitHub } = require("@actions/github");

const knakWorkflowTitle = "# Knak Workflow  ";
const authorWorkflowTitle = "## Author Workflow  ";
const reviewerWorkflowTitle = "## Reviewer Workflow  ";

const uncheckedCheckbox = "- [ ] ";

const qaNeededTask =
  "I am sure that there is no possibility of a regression in this code (Otherwise add label `qa-needed`)";

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
  const ownerRepo = {
    owner: context.repo.owner,
    repo: context.repo.repo
  };

  const authorTasks = [];
  const reviewerTasks = [];

  const pr = await getPR(context, client);

  const comments = await client.issues.listComments({
    ...ownerRepo,
    issue_number: pr.number
  });

  const labels = await client.issues.listLabelsOnIssue({
    ...ownerRepo,
    issue_number: pr.number
  });

  const qaNeededLabelApplied = !!labels.data.find(
    label => label.name === "qa-needed"
  );
  if (!qaNeededLabelApplied) {
    authorTasks.push(qaNeededTask);
    reviewerTasks.push(qaNeededTask);
  }

  let outstandingTaskExists = false;
  let workflowComment = null;

  if (comments.data.length) {
    comments.data.forEach(comment => {
      if (comment.body.includes(uncheckedCheckbox)) {
        outstandingTaskExists = true;
      }
    });
    workflowComment = comments.data.find(comment =>
      comment.body.startsWith(knakWorkflowTitle)
    );
  }

  const authorWorflowTasksBody = authorTasks.map(
    authorTask => uncheckedCheckbox + authorTask + "\n"
  );
  const reviewerWorflowTasksBody = reviewerTasks.map(
    reviewerTask => uncheckedCheckbox + reviewerTask + "\n"
  );
  let comment = {
    body: `${knakWorkflowTitle}
        ${authorWorkflowTitle}
        ${authorWorflowTasksBody}
        ${reviewerWorkflowTitle}
        ${reviewerWorflowTasksBody}`
  };

  if (workflowComment) {
    console.log(JSON.stringify(workflowComment));
    await client.issues.updateComment({
      ...ownerRepo,
      comment_id: workflowComment.id,
      ...comment
    });
  } else {
    await client.issues.createComment({
      ...ownerRepo,
      issue_number: pr.number,
      ...comment
    });
  }

  const startTime = new Date().toISOString();

  let check = {
    name: "knak-workflow",
    head_sha: pr.head.sha,
    started_at: startTime,
    status: "completed",
    conclusion: "action_required",
    output: {
      title: "One or more tasks need to be checked off",
      summary:
        "Please check the comments in the PR for any tasks that have not been checked off",
      text:
        "We check if any task lists need completing before you can merge this PR"
    }
  };

  if (!outstandingTaskExists) {
    check.status = "completed";
    check.conclusion = "success";
    check.completed_at = new Date().toISOString();
    check.output.summary = "All tasks have been completed";
  }

  // send check back to GitHub
  return client.checks.create({
    ...ownerRepo,
    ...check
  });
}

run().catch(err => {
  console.error(err);
  core.setFailed("Unexpected error");
});

// let outstandingTasks = { total: 0, remaining: 0 };
// const checkOutstandingTasks = require("./src/check-outstanding-tasks");
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
