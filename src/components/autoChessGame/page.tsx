// src/components/autoChessGame/page.tsx
import PhaserGame from './PhaserGame';

export default function AutoChessGamePage() {
    return (
        <div className="min-h-screen bg-gray-900 flex flex-col items-center justify-center p-4">
            <div className="mb-8">
                <h1 className="text-4xl font-bold text-white text-center mb-2">
                    自走棋大战
                </h1>
                <p className="text-gray-300 text-center">
                    Auto Chess Battle - 策略布局，自动战斗
                </p>
            </div>

            <div className="bg-gray-800 rounded-lg p-6 shadow-2xl">
                <PhaserGame />
            </div>

            <div className="mt-8 text-center text-gray-400 max-w-2xl">
                <h2 className="text-xl font-semibold text-white mb-4">游戏玩法</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                    <div>
                        <h3 className="font-semibold text-white mb-2">🎯 目标</h3>
                        <p>放置兵营生产单位，击败敌军波次，保护己方基地</p>
                    </div>
                    <div>
                        <h3 className="font-semibold text-white mb-2">🏰 兵营系统</h3>
                        <p>购买单位后在地图上放置兵营，兵营会自动生产战斗单位</p>
                    </div>
                    <div>
                        <h3 className="font-semibold text-white mb-2">⚔️ 羁绊系统</h3>
                        <p>相同阵营的单位数量越多，激活的羁绊效果越强</p>
                    </div>
                    <div>
                        <h3 className="font-semibold text-white mb-2">💰 经济系统</h3>
                        <p>每波次获得金币，用于购买新单位或刷新商店</p>
                    </div>
                </div>
            </div>
        </div>
    );
}
