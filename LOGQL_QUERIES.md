# LogQL Queries cho Nginx

Đây là 3 câu truy vấn LogQL mẫu để demo trên Grafana Explore:

1. **Lấy toàn bộ log Nginx**:
   \`\`\`logql
   {job="nginx"}
   \`\`\`

2. **Lọc status code 200**:
   \`\`\`logql
   {job="nginx"} |= " 200 "
   \`\`\`

3. **Tính rate request theo thời gian**:
   \`\`\`logql
   rate({job="nginx"}[1m])
   \`\`\`
