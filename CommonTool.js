/**
 * 获取屏幕刷新间隔
 * @returns {number|Promise<unknown>}
 */
export const getScreenFrameRate = () => {
    // 介于常规显示器和高刷屏之间的值 （1000 / 90）
    let requestAnimationFrame = window.requestAnimationFrame || window.webkitRequestAnimationFrame || window.mozRequestAnimationFrame;
    if (!requestAnimationFrame) return 11.11;

    return new Promise((resolve) => {
        let startTime, count = 0, ignoreCount = 5, sampleCount = 20;

        const func = (time) => {
            // 发现 edge 前几次调用时间区间间隔比较大，会出现误差，忽略前 5 次
            if (!startTime && count > ignoreCount) {
                startTime = time;
            }
            if (++count > sampleCount) {
                resolve((time - startTime) / (count - ignoreCount - 2));
            } else {
                requestAnimationFrame(func);
            }
        }

        requestAnimationFrame(func)
    })
}