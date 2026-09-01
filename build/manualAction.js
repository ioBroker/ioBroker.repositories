"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const axios_1 = __importDefault(require("axios"));
function closeIssue(owner, adapter, id) {
    return axios_1.default
        .patch(`https://api.github.com/repos/${owner}/ioBroker.${adapter}/issues/${id}`, {
        state: 'close',
    }, {
        headers: {
            Authorization: process.env.OWN_GITHUB_TOKEN ? `token ${process.env.OWN_GITHUB_TOKEN}` : 'none',
            'user-agent': 'Action script',
        },
    })
        .then(response => response.data);
}
console.log('manual action started');
closeIssue('xXBJXx', 'tractive-gps', '2');
console.log('manual action finished');
