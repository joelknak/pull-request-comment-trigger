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

  // check if this is an issue rather than pull event
  if (context.event === "issue_comment" && !pr) {
    // if so we need to make sure this is for a PR only
    if (!context.payload.issue.pull_request) {
      return;
    }
    // & lookup the PR it's for to continue
    let response = await context.github.pulls.get(
      context.repo({
        pull_number: context.payload.pull_request.number
      })
    );
    pr = response.data;
  }

  // console.log("Context: " + JSON.stringify(context));
  console.log("client: " + JSON.stringify(client));

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

  if (context.eventName === "issue_comment") {
    await client.reactions.createForIssueComment({
      owner,
      repo,
      comment_id: context.payload.comment.id,
      content: reaction
    });
  } else {
    await client.reactions.createForIssue({
      owner,
      repo,
      issue_number: context.payload.pull_request.number,
      content: reaction
    });
  }
}

run().catch(err => {
  console.error(err);
  core.setFailed("Unexpected error");
});
