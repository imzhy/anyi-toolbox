export const getScreenFrameRate = () => {
    // 介于常规显示器和高刷屏之间的值 （1000 / 90）
    if (!window.requestAnimationFrame) return 11.11;

    return new Promise((resolve) => {
        let startTime;

        const func = (time) => {
            if (!startTime) {
                startTime = time;
                window.requestAnimationFrame(func);
            } else {
                resolve(time - startTime);
            }
        }

        window.requestAnimationFrame(func)
    })
}