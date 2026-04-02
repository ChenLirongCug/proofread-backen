FROM node:18-alpine

WORKDIR /app

# 安装基础工具
RUN apk add --no-cache tini

# 复制 package 文件
COPY package*.json ./

# 安装生产依赖
RUN npm ci --only=production && \
    npm cache clean --force

# 复制源代码
COPY src/ ./src/
COPY tsconfig.json ./

# 编译 TypeScript
RUN npm run build

# 删除源代码，仅保留编译后的 dist
RUN rm -rf src tsconfig.json

# 创建日志目录
RUN mkdir -p logs

# 暴露端口
EXPOSE 3001

# 健康检查
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3001/health', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})"

# 使用 tini 作为 PID 1 进程
ENTRYPOINT ["/sbin/tini", "--"]

# 启动应用
CMD ["node", "dist/app.js"]
