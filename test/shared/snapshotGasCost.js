"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = snapshotGasCost;
const expect_1 = require("./expect");
async function snapshotGasCost(x) {
    const resolved = await x;
    if (typeof resolved === 'bigint') {
        (0, expect_1.expect)(resolved.toString()).toMatchSnapshot();
    }
    else if ('wait' in resolved) {
        const waited = await resolved.wait();
        waited && (0, expect_1.expect)(waited.gasUsed).toMatchSnapshot();
    }
    else {
        (0, expect_1.expect)(resolved.gasUsed).toMatchSnapshot();
    }
}
